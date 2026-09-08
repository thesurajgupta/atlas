/**
 * The one place the Google Maps JavaScript API is loaded.
 *
 * ## The trade-off this file makes explicit
 *
 * Every other map surface in this console renders from assets served by this
 * origin, because `PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md` treats "which tiles
 * did an operator request" as something a deployment decides, not something a
 * public repo hardcodes to a vendor. A Google basemap reverses that: panning
 * the cash-out map sends the viewport to Google, and the key is public by
 * construction — `NEXT_PUBLIC_*` is inlined into the client bundle, so it is
 * readable by anyone with the page open.
 *
 * That is acceptable for the operational geographic view this screen wants,
 * and unacceptable silently. Two consequences follow and both are enforced
 * here rather than left to a deployment to remember:
 *
 * 1. **No key in the source.** The key comes from the environment or the map
 *    does not load. There is no literal fallback and no default project.
 * 2. **Restrict the key.** A `NEXT_PUBLIC_` key is a public key. It must be
 *    HTTP-referrer restricted to the console's own origins and scoped to the
 *    Maps JavaScript API in the Google Cloud console; otherwise anyone can
 *    bill your project. `apps/web/.env.example` says so beside the variable.
 *
 * ## Why a script tag and not a package
 *
 * `@googlemaps/js-api-loader` does exactly what the twenty lines below do. The
 * API itself is loaded from Google either way, so the package buys nothing but
 * a dependency. `@types/google.maps` is a devDependency: types only, nothing
 * shipped.
 *
 * The import is deferred to the browser in every path — the API touches
 * `window` on evaluation, so it can never be part of a server render.
 */

/**
 * Read through a static property access rather than a dynamic key, because
 * Next inlines `NEXT_PUBLIC_*` at build time only when it can see the whole
 * expression.
 */
export const GOOGLE_MAPS_API_KEY: string =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

/**
 * The placeholder `.env.example` ships, treated as "no key".
 *
 * Without this, an unedited `.env.local` reads as a configured key: the loader
 * requests the API, Google rejects it, and the screen shows an empty dark panel
 * with markers floating on nothing. That is strictly worse than the "Google
 * Maps unavailable" state, which says what is missing and notes that the ranked
 * candidates do not depend on the basemap. A value nobody has replaced is not a
 * key, and pretending otherwise only hides the reason.
 */
const PLACEHOLDER_KEY = 'YOUR_ACTUAL_GOOGLE_MAPS_API_KEY';

export const HAS_GOOGLE_MAPS_KEY =
  GOOGLE_MAPS_API_KEY.length > 0 && GOOGLE_MAPS_API_KEY !== PLACEHOLDER_KEY;

/** The environment variable to name in any message about a missing key. */
export const GOOGLE_MAPS_KEY_VARIABLE = 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY';

const SCRIPT_ID = 'atlas-google-maps-js';
const CALLBACK_NAME = '__atlasGoogleMapsReady';

declare global {
  interface Window {
    __atlasGoogleMapsReady?: () => void;
    /** Called by the API itself when it rejects the key. Not our invention. */
    gm_authFailure?: () => void;
  }
}

type AuthFailureListener = () => void;

const authFailureListeners = new Set<AuthFailureListener>();

/**
 * Subscribe to the API rejecting the key.
 *
 * A bad key is not a script error: the bundle loads, the map draws a grey
 * rectangle and Google calls `window.gm_authFailure`. Without this hook the
 * screen shows an empty panel and no reason for it, which is the failure mode
 * this console spends the most effort avoiding.
 */
export function onGoogleMapsAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

let loadPromise: Promise<typeof google.maps> | null = null;

function loadedNamespace(): typeof google.maps | undefined {
  return (window as { google?: { maps?: typeof google.maps } }).google?.maps;
}

/**
 * Loads the Maps JavaScript API and resolves with the `google.maps` namespace.
 *
 * Safe to call from several components and from a Strict Mode effect that runs
 * twice: the script is injected once and the promise is shared. A failed load
 * is not cached, so a later mount can retry.
 */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  loadPromise ??= new Promise<typeof google.maps>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Maps can only be loaded in a browser'));
      return;
    }
    if (!HAS_GOOGLE_MAPS_KEY) {
      reject(new Error(`${GOOGLE_MAPS_KEY_VARIABLE} is not set`));
      return;
    }

    const already = loadedNamespace();
    if (already !== undefined) {
      resolve(already);
      return;
    }

    window.gm_authFailure = () => {
      for (const listener of authFailureListeners) listener();
    };

    window[CALLBACK_NAME] = () => {
      const maps = loadedNamespace();
      if (maps === undefined) {
        reject(new Error('Google Maps loaded without a maps namespace'));
        return;
      }
      resolve(maps);
    };

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    // `loading=async` is what the API asks for when it is fetched from script
    // rather than from the inline loader, and it requires a callback.
    // No `libraries=`: markers, info windows, circles and polylines are all in
    // the core bundle, and every extra library is another request.
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}` +
      '&v=weekly' +
      '&loading=async' +
      `&callback=${CALLBACK_NAME}`;
    script.addEventListener('error', () => {
      reject(new Error('the Google Maps script could not be fetched'));
    });

    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Do not leave a rejected promise memoised: the next mount should be able
    // to try again, which matters when the first failure was the network.
    loadPromise = null;
    const script = document.getElementById(SCRIPT_ID);
    script?.remove();
    throw error;
  });

  return loadPromise;
}
