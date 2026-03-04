export function FunnelIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top wide section */}
      <path d="M 30 20 L 170 20 C 180 20 190 30 190 40 L 150 60 L 50 60 L 10 40 C 10 30 20 20 30 20" />
      
      {/* Middle section */}
      <path d="M 50 65 L 150 65 C 160 65 170 75 170 85 L 130 105 L 70 105 L 30 85 C 30 75 40 65 50 65" />
      
      {/* Lower section */}
      <path d="M 70 110 L 130 110 C 140 110 150 120 150 130 L 110 150 L 90 150 L 50 130 C 50 120 60 110 70 110" />
      
      {/* Bottom circle */}
      <circle cx="100" cy="170" r="15" />
    </svg>
  );
}
