// The part of the page that does not depend on data. It is rendered to static HTML at build time
// (see site-plugin.ts) so crawlers and the first paint get the heading and verdict without waiting
// for JavaScript or JSON, and React hydrates the same markup.
export const REPO = "https://github.com/Noir-Cpu/noir-informant";

export function Header() {
  return (
    <header>
      <p className="meta">[ 003 ] CASE / INFORMANT</p>
      <h1>Informant</h1>
      <p className="verdict">
        Match forecasts for the Premier League and La Liga, published before kickoff and hash-chained so nobody, including me, can
        edit them afterwards. The model is a plain Elo baseline and it does <em>not</em> beat the bookmakers.
      </p>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="meta">
      Part of the NOIR portfolio by John Balogun · data from <a href="https://www.football-data.co.uk">football-data.co.uk</a> · <a href={REPO}>source on GitHub</a>
    </footer>
  );
}

export function Loading() {
  return (
    <main id="main">
      <p className="meta" role="status">Loading the latest data…</p>
      <noscript>
        <p>
          This page draws its tables and charts with JavaScript. The same numbers are published as JSON
          at <a href="/data/backtest.json">/data/backtest.json</a>, <a href="/data/live.json">/data/live.json</a> and <a href="/data/upcoming.json">/data/upcoming.json</a>,
          and the prediction ledger is in <a href={REPO}>the repository</a>.
        </p>
      </noscript>
    </main>
  );
}

export function Shell() {
  return (
    <>
      <Header />
      <Loading />
      <Footer />
    </>
  );
}
