# HK Cinema Data Schema

Version: 0.1

This document defines the normalized data model used by HK Cinema.

Provider-specific field names must not be exposed directly to the app UI.

---

# 1. Provider

Supported provider IDs:

- broadway
- mcl
- emperor

Provider IDs are always lowercase.

---

# 2. Cinema

```json
{
  "id": "mcl:021",
  "provider": "mcl",
  "sourceId": "021",

  "name": {
    "zh": "MCL THE ONE 戲院",
    "en": "MCL THE ONE"
  },

  "address": {
    "zh": "九龍尖沙咀彌敦道100號The ONE 6樓",
    "en": null
  },

  "region": "hong-kong",
  "district": null,

  "phone": "2834 0123",

  "mapUrl": null,

  "active": true
}
