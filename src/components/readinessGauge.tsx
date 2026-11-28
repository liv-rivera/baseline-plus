type ReadinessGaugeProps = {
  score: number;
};

export const ReadinessGauge = ({score}: ReadinessGaugeProps) => {
  return (
    <svg role="img" aria-label={`Readiness score: ${score} out of 100`}
      fill="none"
      strokeWidth="14"
      strokeLinecap="round"
      viewBox="0 0 200 110">

      <path 
        d="M 20 100 A 80 80 0 0 1 180 100" 
        fill="none"
        strokeWidth="14"
        strokeLinecap="round"
        style={{ stroke: "var(--line)" }}/>
      
      <path 
        d="M 20 100 A 80 80 0 0 1 180 100" 
        fill="none"
        strokeWidth="14"
        strokeLinecap="round"
        style={{ stroke: "var(--accent)" }}
        pathLength="100"
        strokeDasharray={score + " 100"}/>    

      <text
        x="100"
        y="85"
        textAnchor="middle"
        fill="currentColor"
        fontSize="30"
        fontWeight="700"
        fontFamily="var(--font-display)"
      >
        {score}
      </text>
      </svg>
  );
};