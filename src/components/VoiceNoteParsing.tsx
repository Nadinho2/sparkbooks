interface VoiceNoteParsingProps {
  status: "listening" | "parsing" | "done";
  resultText?: string;
}

const BAR_DELAYS = ["0ms", "100ms", "50ms", "150ms", "200ms"];

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2Z" />
      <path d="M3 7a5 5 0 0 0 10 0" />
      <path d="M8 11v3M6 14h4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M10 5l3 3-3 3" />
    </svg>
  );
}

export function VoiceNoteParsing({ status, resultText }: VoiceNoteParsingProps) {
  const isAnimating = status === "listening" || status === "parsing";
  const isDone = status === "done";

  return (
    <div className="flex items-center gap-3">
      {/* Mic icon — always visible, spark color */}
      <div className="text-spark shrink-0">
        <MicIcon />
      </div>

      {/* Waveform bars or result */}
      <div className="flex items-center gap-1 h-4">
        {isDone ? (
          <div className="flex items-center gap-2 transition-opacity duration-300">
            <span className="text-spark shrink-0">
              <ArrowIcon />
            </span>
            {resultText && (
              <span className="text-sm text-ink">{resultText}</span>
            )}
          </div>
        ) : (
          BAR_DELAYS.map((delay, i) => (
            <span
              key={i}
              className={`voice-wave-bar ${isAnimating ? "" : "collapsed"} voice-wave-collapse`}
              style={{
                height: "16px",
                width: "3px",
                marginInline: "1.5px",
                animationPlayState: isAnimating ? "running" : "paused",
                animationDelay: delay,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
