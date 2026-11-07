/*
  Fitness Exclusive - ESP32 turnstile / door controller
  ------------------------------------------------------
  Hardware:  ESP32 DevKit + RC522 RFID reader (SPI) + 1-channel relay (to turnstile "open" dry contact or door lock)
             + green/red LEDs + buzzer (optional)
  Wiring (RC522 -> ESP32): SDA 5, SCK 18, MOSI 23, MISO 19, RST 22, 3.3V, GND
             Relay IN -> GPIO 26, Green LED -> 32, Red LED -> 33, Buzzer -> 25
  Libraries: MFRC522 (by GithubCommunity), ArduinoJson 7  (Arduino IDE > Library Manager)

  Flow:  card tap -> POST /api/device/tap -> server decides (membership, anti-passback, max occupancy)
         -> {"open":true} -> relay pulse -> turnstile turns once.
  Offline: every 5 minutes the controller downloads the allowlist. If the server is unreachable,
           it opens for cards on the cached list and uploads the taps when the server is back.

  SAFETY: door locks must be FAIL-SAFE (unlock on power loss) and have a manual exit button / fire release.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// ---------- settings: change these ----------
const char* WIFI_SSID   = "YOUR_WIFI";
const char* WIFI_PASS   = "YOUR_PASSWORD";
const char* SERVER_URL  = "http://192.168.1.10:3000";     // central server address (see Settings > Devices & System)
const char* DEVICE_KEY  = "dk_paste_the_device_key_here"; // from Settings > Devices & System
const char* MODE        = "auto";  // "in" = entrance reader, "out" = exit reader, "auto" = 1st tap in / 2nd tap out
const int   OPEN_MS     = 800;     // relay pulse length (turnstile) - use ~3000 for a door lock
// --------------------------------------------

#define SS_PIN 5
#define RST_PIN 22
#define RELAY 26
#define LED_OK 32
#define LED_NO 33
#define BUZZER 25

MFRC522 rfid(SS_PIN, RST_PIN);
std::vector<String> allow;         // cached allowlist (offline mode)
std::vector<String> pending;       // taps made while offline
unsigned long lastSync = 0, lastUidTime = 0;
String lastUid = "";

String uidString() {               // same format as USB readers: 10-digit decimal of the 4-byte UID
  uint32_t v = 0;
  for (byte i = 0; i < 4 && i < rfid.uid.size; i++) v = (v << 8) | rfid.uid.uidByte[i];
  char buf[11]; snprintf(buf, sizeof(buf), "%010lu", (unsigned long)v);
  return String(buf);
}

void signal(bool ok) {
  digitalWrite(ok ? LED_OK : LED_NO, HIGH);
  if (ok) { digitalWrite(RELAY, HIGH); tone(BUZZER, 2000, 120); delay(OPEN_MS); digitalWrite(RELAY, LOW); }
  else    { tone(BUZZER, 400, 400); delay(600); }
  digitalWrite(LED_OK, LOW); digitalWrite(LED_NO, LOW);
}

void syncAllowlist() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http; http.begin(String(SERVER_URL) + "/api/device/allowlist");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  if (http.GET() == 200) {
    JsonDocument doc; if (!deserializeJson(doc, http.getString())) {
      allow.clear(); for (JsonVariant v : doc["uids"].as<JsonArray>()) allow.push_back(v.as<String>());
      Serial.printf("Allowlist: %d cards\n", allow.size());
    }
  }
  http.end();
  if (!pending.empty()) {          // upload offline taps
    JsonDocument doc; JsonArray arr = doc["taps"].to<JsonArray>();
    for (auto& u : pending) { JsonObject t = arr.add<JsonObject>(); t["uid"] = u; t["mode"] = MODE; }
    String body; serializeJson(doc, body);
    HTTPClient h2; h2.begin(String(SERVER_URL) + "/api/device/sync");
    h2.addHeader("Content-Type", "application/json"); h2.addHeader("X-Device-Key", DEVICE_KEY);
    if (h2.POST(body) == 200) pending.clear();
    h2.end();
  }
  lastSync = millis();
}

bool askServer(const String& uid, bool& reached) {
  reached = false;
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http; http.setTimeout(2500);
  http.begin(String(SERVER_URL) + "/api/device/tap");
  http.addHeader("Content-Type", "application/json"); http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST("{\"uid\":\"" + uid + "\",\"mode\":\"" + MODE + "\"}");
  bool open = false;
  if (code == 200) {
    reached = true; JsonDocument doc;
    if (!deserializeJson(doc, http.getString())) {
      open = doc["open"] | false;
      Serial.printf("%s -> %s (%s)\n", uid.c_str(), (const char*)(doc["action"] | ""), (const char*)(doc["msg"] | ""));
    }
  }
  http.end();
  return open;
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY, OUTPUT); pinMode(LED_OK, OUTPUT); pinMode(LED_NO, OUTPUT); pinMode(BUZZER, OUTPUT);
  SPI.begin(); rfid.PCD_Init();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  Serial.println(WiFi.status() == WL_CONNECTED ? "WiFi OK " + WiFi.localIP().toString() : "WiFi not connected (offline mode)");
  syncAllowlist();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  if (millis() - lastSync > 5UL * 60UL * 1000UL) syncAllowlist();
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) { delay(30); return; }
  String uid = uidString(); rfid.PICC_HaltA();
  if (uid == lastUid && millis() - lastUidTime < 2500) return;   // ignore double reads
  lastUid = uid; lastUidTime = millis();

  bool reached; bool open = askServer(uid, reached);
  if (!reached) {                    // OFFLINE: use cached list
    open = std::find(allow.begin(), allow.end(), uid) != allow.end();
    if (open) pending.push_back(uid);
    Serial.printf("OFFLINE %s -> %s\n", uid.c_str(), open ? "open" : "denied");
  }
  signal(open);
}
