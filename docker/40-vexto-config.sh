#!/bin/sh
#
# Writes /usr/share/nginx/html/config.json from environment variables, every time the container
# starts. This is the Docker form of the runtime configuration the Angular apps already use
# (public/config.json, read by libs/utilities/src/lib/runtime-config.ts): the bundle is built once
# and the environment is a text file the app fetches — here, generated from .env.
#
# Executed by the nginx image's entrypoint (/docker-entrypoint.d/*.sh, in name order) before nginx
# starts. Everything written here is downloaded by every browser, so nothing here is secret: the
# Maps key is the referrer-restricted browser key and the Stripe key is the publishable one.
#
set -eu

target="/usr/share/nginx/html/config.json"

api_base_url="${VEXTO_API_BASE_URL:-}"

if [ -z "$api_base_url" ]; then
    echo "40-vexto-config: VEXTO_API_BASE_URL is not set; config.json is not written and the app" \
         "will fall back to its built-in development defaults." >&2
    exit 0
fi

# Strip a trailing slash: apiBaseUrl is documented as having none, and a double slash in every
# request URL is the kind of thing a CORS origin check trips over.
api_base_url="${api_base_url%/}"

tracking_hub_url="${VEXTO_TRACKING_HUB_URL:-$api_base_url/hubs/tracking}"

# Minimal JSON escaping for the string values: backslash and double quote. None of these values
# should ever contain either, but a config file that is silently invalid JSON is worse than one
# that is escaped.
esc() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > "$target" <<EOF
{
  "apiBaseUrl": "$(esc "$api_base_url")",
  "environmentName": "$(esc "${VEXTO_ENVIRONMENT_NAME:-}")",
  "trackingHubUrl": "$(esc "$tracking_hub_url")",
  "googleMapsApiKey": "$(esc "${VEXTO_GOOGLE_MAPS_BROWSER_KEY:-}")",
  "driverLocationIntervalSeconds": ${VEXTO_DRIVER_LOCATION_INTERVAL_SECONDS:-5},
  "staleLocationAfterSeconds": ${VEXTO_STALE_LOCATION_AFTER_SECONDS:-45},
  "firebase": {
    "apiKey": "$(esc "${VEXTO_FIREBASE_API_KEY:-}")",
    "authDomain": "$(esc "${VEXTO_FIREBASE_AUTH_DOMAIN:-}")",
    "projectId": "$(esc "${VEXTO_FIREBASE_PROJECT_ID:-}")",
    "messagingSenderId": "$(esc "${VEXTO_FIREBASE_MESSAGING_SENDER_ID:-}")",
    "appId": "$(esc "${VEXTO_FIREBASE_APP_ID:-}")",
    "vapidKey": "$(esc "${VEXTO_FIREBASE_VAPID_KEY:-}")"
  },
  "stripe": {
    "publishableKey": "$(esc "${VEXTO_STRIPE_PUBLISHABLE_KEY:-}")"
  }
}
EOF

echo "40-vexto-config: wrote config.json (apiBaseUrl=$api_base_url, environmentName=${VEXTO_ENVIRONMENT_NAME:-})"
