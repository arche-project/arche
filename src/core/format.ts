export const gb = (n: number) => n >= 100 ? `${Math.round(n)} Go` : n >= 1 ? `${n.toFixed(1)} Go` : `${Math.round(n * 1000)} Mo`;
export const bytes = (n: number) => gb(n / 1e9);
export const pct = (done: number, total?: number) => total ? `${Math.floor(100 * done / total)} %` : `${(done / 1e6).toFixed(0)} Mo`;
