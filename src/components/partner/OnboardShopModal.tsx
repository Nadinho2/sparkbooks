"use client";

import { useState } from "react";
import { onboardShopAction } from "@/app/partner/actions";

interface OnboardShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OnboardShopModal({ isOpen, onClose, onSuccess }: OnboardShopModalProps) {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Provisions");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [cityLga, setCityLga] = useState("");
  const [state, setState] = useState("Lagos");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsTagging, setGpsTagging] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleTagGps = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      return;
    }
    setGpsTagging(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(parseFloat(pos.coords.latitude.toFixed(6)));
        setLongitude(parseFloat(pos.coords.longitude.toFixed(6)));
        setGpsTagging(false);
      },
      (err) => {
        setGpsError(err.message || "Could not retrieve GPS pin.");
        setGpsTagging(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await onboardShopAction({
        businessName,
        businessType,
        whatsappNumber,
        shopAddress: shopAddress.trim() || undefined,
        landmark: landmark.trim() || undefined,
        cityLga: cityLga.trim() || undefined,
        state: state.trim() || undefined,
        latitude,
        longitude,
      });

      if (!res.success) {
        setError(res.error || "Failed to onboard store. Please check the information.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSuccess(false);
        setBusinessName("");
        setWhatsappNumber("");
        setShopAddress("");
        setLandmark("");
        setCityLga("");
        setLatitude(null);
        setLongitude(null);
        onClose();
      }, 2000);
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-rule shadow-xl max-w-md w-full p-6 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors p-1"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mb-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-money-light text-money text-xs font-semibold mb-2">
            ⚡ 30-Second Setup
          </div>
          <h2 className="text-xl font-display font-bold text-ink">
            Onboard New Shop
          </h2>
          <p className="text-xs text-ink-muted mt-1">
            Store is immediately linked to your portfolio and sent a welcome WhatsApp message.
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {success ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-money-light text-money flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-bold text-ink text-base">Shop Activated!</h3>
            <p className="text-xs text-ink-muted mt-1">
              Welcome WhatsApp message sent to merchant. You can test transactions right now!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Shop / Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mama Chichi Supermarket"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
                >
                  <option value="Provisions">Provisions / Foodstuff</option>
                  <option value="Hair/Beauty">Hair / Cosmetics</option>
                  <option value="Fashion">Fashion / Boutique</option>
                  <option value="Electronics">Electronics / Gadgets</option>
                  <option value="Other">Other Retail Business</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  State / Region
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lagos, Abuja"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Merchant WhatsApp Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="0803 123 4567 or +234..."
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              />
              <p className="text-[11px] text-ink-muted mt-0.5">
                Active WhatsApp number for instant automated bookkeeping prompts.
              </p>
            </div>

            {/* Physical Shop Location Details */}
            <div className="pt-2 border-t border-rule space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1">
                  <span>📍</span> Physical Shop Location
                </span>
                <span className="text-[10px] text-ink-muted bg-sand-light px-2 py-0.5 rounded border border-rule">
                  Enables Field Visits & Maps
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink mb-1">
                  Shop / Stall / Plaza Number & Street
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shop C-14, 2nd Floor, Tejuosho Market"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-ink mb-1">
                    Landmark / Directions Guide
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Opp UBA ATM"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink mb-1">
                    City / Local Area
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Yaba / Mainland"
                    value={cityLga}
                    onChange={(e) => setCityLga(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
                  />
                </div>
              </div>

              {/* Optional 1-Tap GPS Pin Button */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-sand-light/60 border border-rule">
                <div>
                  <div className="text-[11px] font-semibold text-ink flex items-center gap-1">
                    <span>⚡</span> <span>Tag On-Site GPS Pin</span>
                    <span className="text-[10px] text-ink-muted font-normal">(Optional)</span>
                  </div>
                  {latitude && longitude ? (
                    <div className="text-[10px] text-money font-mono mt-0.5">
                      ✓ Pin: {latitude.toFixed(4)}, {longitude.toFixed(4)}
                    </div>
                  ) : (
                    <div className="text-[10px] text-ink-muted mt-0.5">
                      Auto-records coordinates for 1-tap Google Maps directions.
                    </div>
                  )}
                  {gpsError && (
                    <div className="text-[10px] text-red-600 mt-0.5">
                      {gpsError}
                    </div>
                  )}
                </div>

                {latitude && longitude ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLatitude(null);
                      setLongitude(null);
                    }}
                    className="px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                  >
                    Clear Pin
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleTagGps}
                    disabled={gpsTagging}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-rule bg-white text-ink hover:bg-paper transition-all shrink-0 flex items-center gap-1 shadow-2xs"
                  >
                    {gpsTagging ? (
                      <span className="animate-spin text-ink-muted">⏳</span>
                    ) : (
                      <span>📍</span>
                    )}
                    <span>{gpsTagging ? "Locating..." : "Tag GPS"}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-money rounded-lg hover:bg-money/90 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Setting up shop & sending WhatsApp...</span>
                  </>
                ) : (
                  <span>Activate & Connect Shop</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
