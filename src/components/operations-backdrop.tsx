import { motion, useReducedMotion } from 'motion/react';

const primaryRoads = [
  'M-20 280 L140 160 L310 160 L450 10',
  'M60 360 L230 190 L420 190 L620 -10',
  'M190 360 L320 230 L490 230 L670 40',
  'M-40 120 L130 120 L290 280 L620 280',
  'M140 -20 L260 100 L510 100 L680 270',
  'M-10 40 L210 200 L380 200 L590 350',
];

const signalNodes = [
  { cx: 140, cy: 160, label: 'North Node', color: 'var(--signal-green)' },
  { cx: 420, cy: 190, label: 'Central Arterial', color: 'var(--signal-green)' },
  { cx: 490, cy: 230, label: 'East Hub', color: 'var(--signal-blue)' },
  { cx: 260, cy: 100, label: 'West Corridor', color: 'var(--signal-green)' },
  { cx: 290, cy: 280, label: 'South Transit', color: 'var(--signal-blue)' },
];

export default function OperationsBackdrop() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="operations-backdrop overflow-hidden select-none pointer-events-none" aria-hidden="true">
      {/* Soft Emerald and Mint Ambient Glow Orbs on Crisp White/Light Canvas */}
      {!reducedMotion && (
        <>
          <motion.div
            className="absolute -top-16 -left-16 w-96 h-96 rounded-full blur-3xl opacity-25 bg-emerald-300"
            animate={{
              scale: [1, 1.2, 1],
              x: [0, 20, 0],
              y: [0, -15, 0],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-1/4 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 bg-teal-300"
            animate={{
              scale: [1, 1.25, 1],
              x: [0, -25, 0],
              y: [0, 20, 0],
            }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
          <motion.div
            className="absolute -bottom-20 left-1/3 w-80 h-80 rounded-full blur-3xl opacity-20 bg-emerald-200"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.15, 0.25, 0.15],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          />
        </>
      )}

      {/* Grid Drift Overlay */}
      <div className="operations-grid" />

      {/* Road Network SVG Motion Surfaces */}
      <svg viewBox="0 0 680 360" preserveAspectRatio="xMidYMid slice" className="operations-roads">
        <defs>
          <linearGradient id="roadGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--signal-green)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--signal-blue)" stopOpacity="0.8" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {primaryRoads.map((road, index) => (
          <g key={road}>
            {/* Background static road vector track */}
            <path d={road} className="operations-road-track" />

            {/* Glowing animated pulse flow */}
            <motion.path
              d={road}
              className={`operations-road-flow flow-${index % 2}`}
              strokeDasharray="30 400"
              filter="url(#glow)"
              animate={reducedMotion ? false : { strokeDashoffset: [430, 0] }}
              transition={{
                duration: 6 + index * 1.8,
                repeat: Infinity,
                ease: 'linear',
                delay: index * 0.4,
              }}
            />
          </g>
        ))}

        {/* Signal Intersection Nodes with Radar Rings */}
        {signalNodes.map((node, index) => (
          <g key={index}>
            <motion.circle
              cx={node.cx}
              cy={node.cy}
              r="16"
              className="operations-node-ring"
              stroke={node.color}
              animate={
                reducedMotion
                  ? false
                  : {
                      opacity: [0.2, 0.8, 0.2],
                      scale: [0.8, 1.4, 0.8],
                    }
              }
              transition={{
                duration: 3.2,
                repeat: Infinity,
                delay: index * 0.6,
                ease: 'easeInOut',
              }}
            />
            <motion.circle
              cx={node.cx}
              cy={node.cy}
              r="24"
              fill="none"
              stroke={node.color}
              strokeWidth="0.75"
              strokeDasharray="3 3"
              animate={reducedMotion ? false : { rotate: 360 }}
              transition={{ duration: 20 + index * 5, repeat: Infinity, ease: 'linear' }}
            />
            <circle cx={node.cx} cy={node.cy} r="4.5" fill={node.color} className="drop-shadow-sm" />
          </g>
        ))}
      </svg>
    </div>
  );
}