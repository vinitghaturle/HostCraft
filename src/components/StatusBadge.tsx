/**
 * StatusBadge — Shows online/offline status + current host name.
 */
export default function StatusBadge({
  online,
  hostName,
}: {
  online: boolean;
  hostName: string | null;
}) {
  if (online) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
        </span>
        <span className="text-sm text-emerald-400 font-medium">
          Online{hostName ? ` · Hosted by ${hostName}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
      <span className="text-sm text-red-400/80 font-medium">Offline</span>
    </div>
  );
}
