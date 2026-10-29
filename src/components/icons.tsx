import type { ReactNode } from "react";

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const NowIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const TrackIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4.5 19.5h15" />
    <path d="M7.5 16v-4M12 16V7.5M16.5 16v-6" />
  </Icon>
);

export const TasksIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect height="16" rx="3" width="16" x="4" y="4" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
);

export const ItemsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M8 6.5h11M8 12h11M8 17.5h11" />
    <circle cx="4.5" cy="6.5" fill="currentColor" r="0.9" stroke="none" />
    <circle cx="4.5" cy="12" fill="currentColor" r="0.9" stroke="none" />
    <circle cx="4.5" cy="17.5" fill="currentColor" r="0.9" stroke="none" />
  </Icon>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect height="16" rx="3" width="17" x="3.5" y="5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const ArchiveIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect height="4.5" rx="1.5" width="18" x="3" y="4" />
    <path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" />
  </Icon>
);

export const ChevronLeftIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const ChevronDownIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const PlusIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const UndoIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M9 14 4.5 9.5 9 5" />
    <path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3" />
  </Icon>
);

export const CloseIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Icon>
);
