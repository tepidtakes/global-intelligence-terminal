// Cross-checked figures on country profiles: the same headline statistic as the World Bank and the
// IMF report it for the same year, and whether the two agree (server/agreement.ts).
import { useApi } from '../../api';
import { Card, Loading, SourceRef, Unavailable } from '../../components/common';
import { ago } from '../../format';

const VERDICT: Record<string, [string, string, string]> = {
  agree: ['ok', '✓ agree', 'Within the tolerance'],
  differ: ['stale', '≈ differ', 'Apart by up to three times the tolerance — usually revisions or different methods'],
  conflict: ['failing', '⚠ conflict', 'Apart by more than three times the tolerance — one figure may be wrong, stale or defined differently'],
};
const TITLE = 'Cross-checked figures';

export function AgreementSection({ iso3 }: { iso3: string }) {
  const { data, loading, error } = useApi<any>(`/quality/agreement/${encodeURIComponent(iso3)}`, 3600_000);
  if (loading && !data) return <Card title={TITLE} id="cross-checks"><Loading lines={3} /></Card>;
  if (error) return <Card title={TITLE} id="cross-checks"><Unavailable>Cross-checks unavailable: {error.message}</Unavailable></Card>;
  if (!data?.ready || (!data.checks.length && !data.skipped.length)) return null;
  return (
    <Card title={TITLE} id="cross-checks">
      <div className="small muted" style={{ marginBottom: 8 }}>The same statistic as two independent publishers report it for the same year. Small gaps are normal: revisions and methods differ.</div>
      {data.checks.length > 0 && (
        <div style={{ overflowX: 'auto' }}><table className="data"><thead><tr><th>Figure</th><th className="num">Year</th><th className="num">World Bank</th><th className="num">IMF</th><th>Verdict</th></tr></thead>
          <tbody>{data.checks.map((c: any) => { const [cls, label, tip] = VERDICT[c.verdict] || ['', c.verdict, '']; return (
            <tr key={c.key}>
              <td>{c.label}{c.note && c.verdict !== 'agree' && <div className="tiny muted">{c.note}</div>}</td>
              <td className="num">{c.year}</td><td className="num">{c.wbText}</td><td className="num">{c.imfText}</td>
              <td className="small" title={tip}><span className={`health ${cls}`} />{label}<div className="tiny muted">{c.gapText}; tolerance {c.allowedText}</div></td>
            </tr>); })}</tbody></table></div>
      )}
      {data.skipped.length > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>Not compared — {data.skipped.map((s: any) => `${s.label}: ${s.reason}`).join(' · ')}.</div>}
      <div className="tiny muted" style={{ marginTop: 6 }}>World Bank WDI <SourceRef id="world-bank-wdi" prefix="" /> · IMF World Economic Outlook <SourceRef id="imf-weo" prefix="" /> · compared {ago(data.at)}</div>
    </Card>
  );
}
