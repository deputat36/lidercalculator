# CRM Lider refactor checklist

1. Stabilize auth and session storage.
2. Move complex order creation to server-side function.
3. Keep all Lider tables under leader_ prefix.
4. Remove old unprefixed table usage from frontend.
5. Split UI modules by responsibility.
