export const CONFIG = {
  webhookUrl: "https://script.google.com/macros/s/AKfycbz0ltp6gn4Tt69BxjCTM26E-fb-88PRj8yrpzWvJaO4e-3PUNQpHFOzParGvE9JPvoz/exec",            // Apps Script /exec URL — pasted in Task 9
  pinSalt: "scat-purewal-2026",
  pinHash: "f129befc23b0966b656f4b33a304fecc99639890b89260a17b11ba1e5144e6d7",               // sha256(pinSalt + PIN) hex — set in Task 11 with Meninder's PIN; also seeds the webhook token (sha256(pinSalt + PIN + ":webhook"), derived at unlock time)
  kids: [
    {id: "krish", name: "Krish", level: "advanced",     start: {v: 2, q: 2}},
    {id: "arya",  name: "Arya",  level: "advanced",     start: {v: 1, q: 1}},
    {id: "kira",  name: "Kira",  level: "intermediate", start: {v: 2, q: 2}},
  ],
};
