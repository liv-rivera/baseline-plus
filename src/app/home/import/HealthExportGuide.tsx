import styles from "./HealthExportGuide.module.css";

// Simplified drawings of the Health app, not screenshots. They show where to
// tap, so the person knows what they're looking for on their own phone.

const Phone = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg className={styles.drawing} viewBox="0 0 160 220" role="img" aria-label={label}>
    <rect x="22" y="4" width="116" height="212" rx="18" className={styles.phoneBody} />
    <rect x="28" y="10" width="104" height="200" rx="13" className={styles.screen} />
    <rect x="64" y="14" width="32" height="7" rx="3.5" className={styles.notch} />
    {children}
  </svg>
);

const Row = ({ y, width = 64, muted = true }: { y: number; width?: number; muted?: boolean }) => (
  <rect x="38" y={y} width={width} height="5" rx="2.5" className={muted ? styles.lineMuted : styles.line} />
);

function SummaryDrawing() {
  return (
    <Phone label="The Health app's Summary screen, with your profile picture at the top right highlighted">
      <text x="38" y="46" className={styles.title}>Summary</text>
      <circle cx="118" cy="42" r="9" className={styles.target} />
      <circle cx="118" cy="40" r="3" className={styles.targetInk} />
      <path d="M112 47 a6 5 0 0 1 12 0" className={styles.targetInk} />
      <circle cx="118" cy="42" r="14" className={styles.ring} />
      <rect x="36" y="60" width="88" height="34" rx="7" className={styles.card} />
      <Row y={68} width={40} muted={false} />
      <Row y={80} width={60} />
      <rect x="36" y="102" width="88" height="34" rx="7" className={styles.card} />
      <Row y={110} width={48} muted={false} />
      <Row y={122} width={56} />
      <rect x="36" y="144" width="88" height="34" rx="7" className={styles.card} />
      <Row y={152} width={36} muted={false} />
      <Row y={164} width={64} />
    </Phone>
  );
}

function ProfileDrawing() {
  return (
    <Phone label="The bottom of the profile screen, with Export All Health Data highlighted">
      <Row y={30} width={50} />
      <rect x="36" y="42" width="88" height="44" rx="7" className={styles.card} />
      <Row y={52} width={54} muted={false} />
      <Row y={64} width={44} muted={false} />
      <Row y={76} width={60} muted={false} />
      <rect x="36" y="96" width="88" height="22" rx="7" className={styles.card} />
      <Row y={105} width={48} muted={false} />
      <rect x="32" y="150" width="96" height="26" rx="8" className={styles.highlight} />
      <text x="80" y="167" textAnchor="middle" className={styles.action}>Export All Health Data</text>
      <circle cx="80" cy="163" r="22" className={styles.ringWide} />
    </Phone>
  );
}

function ConfirmDrawing() {
  return (
    <Phone label="A confirmation asking whether to export all health data, with Export highlighted">
      <rect x="28" y="10" width="104" height="200" rx="13" className={styles.dim} />
      <rect x="40" y="76" width="80" height="70" rx="10" className={styles.dialog} />
      <text x="80" y="96" textAnchor="middle" className={styles.dialogTitle}>Export All</text>
      <text x="80" y="106" textAnchor="middle" className={styles.dialogTitle}>Health Data?</text>
      <line x1="40" y1="118" x2="120" y2="118" className={styles.divider} />
      <line x1="80" y1="118" x2="80" y2="146" className={styles.divider} />
      <text x="60" y="136" textAnchor="middle" className={styles.dialogMuted}>Cancel</text>
      <text x="100" y="136" textAnchor="middle" className={styles.action}>Export</text>
      <circle cx="100" cy="132" r="13" className={styles.ring} />
    </Phone>
  );
}

function SendDrawing() {
  return (
    <svg className={styles.drawing} viewBox="0 0 160 220" role="img" aria-label="A folder called apple_health_export on a computer, holding export.xml">
      <rect x="10" y="40" width="140" height="96" rx="8" className={styles.phoneBody} />
      <rect x="16" y="46" width="128" height="84" rx="4" className={styles.screen} />
      <path d="M8 140 h144 l-8 10 h-128 z" className={styles.phoneBody} />
      <path d="M46 70 h20 l6 6 h30 a4 4 0 0 1 4 4 v30 a4 4 0 0 1 -4 4 h-56 a4 4 0 0 1 -4 -4 v-36 a4 4 0 0 1 4 -4 z" className={styles.folder} />
      <text x="80" y="126" textAnchor="middle" className={styles.caption}>apple_health_export</text>
      <rect x="40" y="168" width="80" height="26" rx="6" className={styles.card} />
      <text x="80" y="185" textAnchor="middle" className={styles.file}>export.xml</text>
      <path d="M80 136 v26" className={styles.arrow} />
      <path d="M75 157 l5 6 l5 -6" className={styles.arrow} />
    </svg>
  );
}

const steps = [
  {
    drawing: <SummaryDrawing />,
    title: "Open Health and tap your picture",
    body: "On your iPhone, open the Health app. On the Summary tab, tap your profile picture or initials in the top-right corner.",
  },
  {
    drawing: <ProfileDrawing />,
    title: "Tap Export All Health Data",
    body: "Scroll to the very bottom of your profile and tap Export All Health Data.",
  },
  {
    drawing: <ConfirmDrawing />,
    title: "Confirm and wait",
    body: "Tap Export. Your iPhone prepares the file, which can take a few minutes if you have years of data. Keep the Health app open.",
  },
  {
    drawing: <SendDrawing />,
    title: "Send it to this computer",
    body: "When the share sheet appears, AirDrop it to your Mac or save it to iCloud Drive in Files. On a Mac, opening export.zip gives you the apple_health_export folder.",
  },
];

export function HealthExportGuide() {
  return (
    <section className={styles.guide} aria-labelledby="health-guide-title">
      <h3 id="health-guide-title" className={styles.guideTitle}>Get your export from the Health app</h3>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <div className={styles.drawingFrame}>{step.drawing}</div>
            <p className={styles.stepNumber}>Step {index + 1}</p>
            <h4>{step.title}</h4>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <p className={styles.note}>
        These are simplified drawings, not screenshots. Apple sometimes moves things a little between iOS versions. If
        your screen looks different, look for Export All Health Data at the bottom of your profile.
      </p>
    </section>
  );
}
