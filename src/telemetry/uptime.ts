export function getUptimeSeconds(): number {
  return Math.floor(process.uptime());
}
