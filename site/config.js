export const CONFIG = {
  webhookUrl: "https://script.google.com/macros/s/AKfycbz0ltp6gn4Tt69BxjCTM26E-fb-88PRj8yrpzWvJaO4e-3PUNQpHFOzParGvE9JPvoz/exec",            // Apps Script /exec URL — pasted in Task 9
  token: "b9d4148dac05528f2d435e1ba36f09a9",                 // must equal Script Property SCAT_TOKEN — set in Task 9
  pinSalt: "scat-purewal-2026",
  pinHash: "b98241f882e040154e53a267781c98793d02c06f439fc5d91395e2d17592aa9b",               // sha256(pinSalt + PIN) hex — set in Task 11 with Meninder's PIN
  kids: [
    {id: "krish", name: "Krish", level: "advanced",     start: {v: 2, q: 2}},
    {id: "arya",  name: "Arya",  level: "advanced",     start: {v: 1, q: 1}},
    {id: "kira",  name: "Kira",  level: "intermediate", start: {v: 2, q: 2}},
  ],
};
