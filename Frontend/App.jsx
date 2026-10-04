import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { researchPrompts as questions, marketSecurities, fetchMarketSecurities, formatQuoteTimestamp } from './services/marketData.js';

const NAV = [
  { group: 'DISCOVER', items: [['Overview', '⌂'], ['Markets', '◷'], ['Market Brain', '✳'], ['Market Map', '▦'], ['What Changed', '↗'], ['News Intelligence', '▧']] },
  { group: 'RESEARCH', items: [['Stocks', '▤'], ['Assets', '◈'], ['Industry Intel', '⌘'], ['Screener', '⌕'], ['Reports', '▣'], ['Research Workspace', '▧']] },
  { group: 'ANALYZE', items: [['AI Analyst', '✳'], ['Risk Radar', '◉'], ['Forecast Lab', '⌁'], ['Scenario Simulator', '◇'], ['Calculator Lab', '＋']] },
  { group: 'MANAGE & LEARN', items: [['Watchlist', '☆'], ['Portfolio', '◫'], ['Alerts', '♧'], ['Learning', 'ⓘ'], ['Settings', '⚙']] },
];
const assets = marketSecurities;
const periods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
const marketEnv = import.meta.env || {};
const marketPollMs = Math.min(300000, Math.max(15000, Number(marketEnv.VITE_MARKET_POLL_MS) || 30000));
const validTicker = ticker => typeof ticker === 'string' && /^[A-Z0-9._-]{1,20}$/.test(ticker);

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }

function readLocalValue(key, fallback, validate = () => true) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key));
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing or restricted environments.
  }
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getLocalDateOnly() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function AuthPage({ onPreview, marketStatus }) {
  const [mode, setMode] = useState('Sign in');
  const [notice, setNotice] = useState('');
  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand" aria-label="StockSense"><span className="brand-mark">S</span><span>stocksense<span className="brand-dot">.</span></span></div>
      <div className="auth-copy"><span className="eyebrow">YOUR FINANCIAL RESEARCH WORKSPACE</span><h1 id="auth-title">Research with more clarity.</h1><p>Sign in to continue to your workspace.</p></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access">{['Sign in', 'Create account'].map(tab => <button type="button" role="tab" aria-selected={mode === tab} className={mode === tab ? 'active' : ''} key={tab} onClick={() => { setMode(tab); setNotice(''); }}>{tab}</button>)}</div>
      <form className="auth-form" onSubmit={event => { event.preventDefault(); setNotice('Account services are not connected yet. No credentials were sent or stored.'); }}>
        {mode === 'Create account' && <label>Full name<input autoComplete="name" placeholder="Your name" required /></label>}
        <label>Work email<input type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <label>Password<input type="password" autoComplete={mode === 'Sign in' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" minLength={8} required /></label>
        {mode === 'Sign in' && <button type="button" className="auth-link" onClick={() => setNotice('Password recovery becomes available when account services are connected.')}>Forgot password?</button>}
        <button className="auth-submit" type="submit">{mode} <span>→</span></button>
      </form>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      <div className="auth-divider"><span>OR</span></div>
      <button type="button" className="auth-preview" onClick={onPreview}>Explore the workspace preview</button>
      <p className="auth-legal">By continuing, you agree to the applicable terms and privacy policy. Authentication is not configured in this frontend.</p>
    </section>
    <aside className="auth-aside"><div className="auth-aside-content"><span className="eyebrow">A CALMER WAY TO FOLLOW MARKETS</span><h2>See the bigger picture, without losing sight of the details.</h2><p>Research equities, commodities, digital assets, and fixed income in one workspace—with data status and context in view.</p><div className="auth-asset-chips"><span>Equities</span><span>Gold</span><span>Crypto</span><span>Bonds</span></div><div className="auth-trust-note">{marketStatus.status === 'online' ? `DATA SOURCE AVAILABLE · ${marketStatus.source}` : marketStatus.status === 'stale' ? 'MARKET DATA MAY BE STALE' : 'NO MARKET FEED CONNECTED · No sample figures included'}</div></div></aside>
  </main>;
}

function LineChart() {
  return <div className="chart-wrap" role="status"><div className="empty-inline"><span>⌁</span><p>Chart unavailable: connect a timestamped market-data provider.</p></div></div>;
}

function App() {
  const [workspacePreview, setWorkspacePreview] = useState(false);
  const [marketStatus, setMarketStatus] = useState({ status: 'loading', source: '', updatedAt: null, error: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState('Overview');
  const searchInputRef = useRef(null);
  const mobileNavRef = useRef(null);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [period, setPeriod] = useState('1D');
  const [dark, setDark] = useState(() => readLocalValue('stocksense:theme', false, value => typeof value === 'boolean'));
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [watchlist, setWatchlist] = useState(() => readLocalValue(
    'stocksense:watchlist',
    [],
    value => Array.isArray(value) && value.length <= 1000 && new Set(value).size === value.length && value.every(validTicker)
  ));
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [savedScreen, setSavedScreen] = useState(() => readLocalValue('stocksense:saved-screen', null, value => value === null || (value && ['All sectors', 'Technology', 'Energy', 'Financials', 'Automotive'].includes(value.sector))));
  const [sector, setSector] = useState(() => readLocalValue('stocksense:saved-screen', null, value => value && ['All sectors', 'Technology', 'Energy', 'Financials', 'Automotive'].includes(value.sector))?.sector || 'All sectors');
  const [activeTab, setActiveTab] = useState('Overview');
  const [profile, setProfile] = useState({ name: 'Guest user', email: '' });
  const [profileDraft, setProfileDraft] = useState(profile);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [savedCalculations, setSavedCalculations] = useState(() => readLocalValue(
    'stocksense:saved-calculations',
    [],
    value => Array.isArray(value) && value.length <= 50 && value.every(item =>
      item && typeof item.id === 'string' && typeof item.name === 'string' &&
      typeof item.result === 'string' && typeof item.formula === 'string' &&
      typeof item.savedAt === 'string' && Number.isFinite(Date.parse(item.savedAt)) &&
      (item.inputs === undefined || typeof item.inputs === 'string')
    )
  ));

  useEffect(() => {
    const handleShortcut = (event) => {
      if (workspacePreview && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        setActiveSearchIndex(-1);
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setActiveSearchIndex(-1);
        setProfileMenuOpen(false);
        setProfileDialogOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [workspacePreview]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const result = await fetchMarketSecurities({ signal: controller.signal });
        if (active) setMarketStatus({ ...result, error: '' });
      } catch (error) {
        if (!active) return;
        setMarketStatus(current => ({
          ...current,
          status: assets.length ? 'stale' : 'offline',
          error: 'Unable to refresh market data. Showing no new quotes.',
        }));
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };
    refresh();
    const interval = window.setInterval(refresh, marketPollMs);
    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOnOutsidePointer = event => {
      if (!mobileNavRef.current?.contains(event.target)) setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [mobileMenuOpen]);

  useEffect(() => writeLocalValue('stocksense:theme', dark), [dark]);
  useEffect(() => writeLocalValue('stocksense:watchlist', watchlist), [watchlist]);
  useEffect(() => writeLocalValue('stocksense:saved-screen', savedScreen), [savedScreen]);
  useEffect(() => writeLocalValue('stocksense:saved-calculations', savedCalculations), [savedCalculations]);

  useEffect(() => {
    if (!profileDialogOpen) return undefined;
    const previousFocus = document.activeElement;
    const dialog = document.querySelector('.profile-dialog');
    const getFocusable = () => dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') || [];
    getFocusable()[0]?.focus();

    const keepFocusInside = event => {
      if (event.key !== 'Tab') return;
      const focusable = [...getFocusable()];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [profileDialogOpen]);

  const saveCalculation = calculation => {
    setSavedCalculations(current => [calculation, ...current.filter(item => item.id !== calculation.id)].slice(0, 50));
  };
  const removeCalculation = id => setSavedCalculations(current => current.filter(item => item.id !== id));

  const searchResults = useMemo(() => {
    if (!query.trim()) return assets.slice(0, 3);
    const term = query.trim().toLowerCase();
    return assets.filter(asset => `${asset.name} ${asset.ticker} ${asset.sector}`.toLowerCase().includes(term));
  }, [query, marketStatus, assets.length]);
  const selectSearchResult = (asset) => {
    setSelectedTicker(asset.ticker);
    setActiveTab('Overview');
    setSearchOpen(false);
    setActiveSearchIndex(-1);
    goTo(asset.assetType && asset.assetType !== 'Equity' ? 'Assets' : 'Stocks');
  };
  const equities = assets.filter(asset => !asset.assetType || asset.assetType === 'Equity');
  const filteredAssets = sector === 'All sectors' ? equities : equities.filter(a => a.sector === sector);
  const toggleWatch = (ticker) => setWatchlist(current => current.includes(ticker) ? current.filter(item => item !== ticker) : [...current, ticker]);
  const goTo = (next) => { if (next === 'Stocks') setActiveTab('Overview'); setPage(next); setSearchOpen(false); setQuery(''); setActiveSearchIndex(-1); setProfileMenuOpen(false); setMobileMenuOpen(false); };
  const openAsset = (asset) => {
    setSelectedTicker(asset.ticker);
    setActiveTab('Overview');
    goTo(asset.assetType && asset.assetType !== 'Equity' ? 'Assets' : 'Stocks');
  };
  const runCommand = (text) => {
    const value = text.trim();
    if (!value) return;
    const normalized = value.toLowerCase();
    const terms = normalized.match(/[a-z0-9]+/g) || [];
    const match = assets.find(item => terms.includes(item.ticker.toLowerCase()) || normalized.includes(item.name.toLowerCase()));
    if (match) {
      setSelectedTicker(match.ticker);
      if (/scenario|what if|bull|bear/.test(normalized)) goTo('Scenario Simulator');
      else if (/map|universe/.test(normalized)) goTo('Market Map');
      else if (/risk/.test(normalized)) goTo('Risk Radar');
      else if (/news/.test(normalized)) goTo('News Intelligence');
      else if (/compare|versus|\bvs\b|why|explain|analy[sz]e|research|moving|falling|rising/.test(normalized)) { setPrompt(value); askAnalyst(value); }
      else goTo(match.assetType && match.assetType !== 'Equity' ? 'Assets' : 'Stocks');
      return;
    }
    if (/what changed|since.*visit/.test(normalized)) goTo('What Changed');
    else if (/market brain|market pulse|market brief/.test(normalized)) goTo('Market Brain');
    else if (/scenario|what if|simulate/.test(normalized)) goTo('Scenario Simulator');
    else if (/risk radar|risk/.test(normalized)) goTo('Risk Radar');
    else if (/market map/.test(normalized)) goTo('Market Map');
    else if (/industry/.test(normalized)) goTo('Industry Intel');
    else if (/forecast|prediction|model outlook/.test(normalized)) goTo('Forecast Lab');
    else if (/learn|explain pe|explain rsi/.test(normalized)) goTo('Learning');
    else if (/news/.test(normalized)) goTo('News Intelligence');
    else if (/watchlist/.test(normalized)) goTo('Watchlist');
    else if (/portfolio|holdings/.test(normalized)) goTo('Portfolio');
    else if (/screen|find .*companies|companies with|stocks with/.test(normalized)) goTo('Screener');
    else if (/market|nifty|sensex/.test(normalized)) goTo('Markets');
    else if (/\bstocks\b|\bassets\b/.test(normalized)) goTo('Stocks');
    else { setPrompt(value); askAnalyst(value); }
  };
  const openProfileEditor = () => {
    setProfileDraft(profile);
    setProfileMenuOpen(false);
    setProfileDialogOpen(true);
  };
  const signOut = () => {
    setProfileMenuOpen(false);
    setProfileDialogOpen(false);
    setSearchOpen(false);
    setActiveSearchIndex(-1);
    setPage('Overview');
    setSelectedTicker('');
    setActiveTab('Overview');
    setPrompt('');
    setAnswer('');
    setWorkspacePreview(false);
  };
  const profileInitials = profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A';
  const askAnalyst = (text = prompt) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPrompt(trimmed);
    setAnswer('Research services are not connected. No AI-generated answer or market claims are available. Connect an AI service with source retrieval before enabling analyst responses.');
    setSearchOpen(false);
    setQuery('');
    setActiveSearchIndex(-1);
    setPage('AI Analyst');
  };

  if (!workspacePreview) return <AuthPage onPreview={() => setWorkspacePreview(true)} marketStatus={marketStatus} />;

  return (
    <div className={`app-shell ${dark ? 'theme-dark' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => goTo('Overview')} aria-label="Go to overview"><span className="brand-mark">S</span><span>StockSense<span className="brand-dot">.</span></span></button>
        <div className="global-search">
          <Icon>⌕</Icon>
          <input ref={searchInputRef} role="combobox" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="command-search-popover" aria-activedescendant={searchOpen && activeSearchIndex >= 0 ? `search-option-${activeSearchIndex}` : undefined} aria-label="Research command bar: search assets or navigate by natural-language request" value={query} onFocus={() => { setActiveSearchIndex(-1); setSearchOpen(true); }} onChange={e => { setQuery(e.target.value); setActiveSearchIndex(-1); setSearchOpen(true); }} onKeyDown={e => {
            if (e.key === 'ArrowDown' && searchOpen && searchResults.length) { e.preventDefault(); setActiveSearchIndex(index => (index + 1) % searchResults.length); }
            if (e.key === 'ArrowUp' && searchOpen && searchResults.length) { e.preventDefault(); setActiveSearchIndex(index => index <= 0 ? searchResults.length - 1 : index - 1); }
            if (e.key === 'Enter' && query.trim()) { e.preventDefault(); if (activeSearchIndex >= 0 && searchResults[activeSearchIndex]) selectSearchResult(searchResults[activeSearchIndex]); else runCommand(query); }
            if (e.key === 'Escape') setSearchOpen(false);
          }} placeholder="Ask anything about markets…  (⌘K)" />
          <kbd>⌘ K</kbd>
          {searchOpen && <div id="command-search-popover" className="search-popover"><div className="popover-label">{query ? 'MATCHING ASSETS' : 'QUICK SEARCH'}</div>{searchResults.length ? <div id="command-search-results" role="listbox" aria-label="Asset search results">{searchResults.map((item, index) => <button type="button" role="option" id={`search-option-${index}`} aria-selected={activeSearchIndex === index} key={item.ticker} className={`search-result ${activeSearchIndex === index ? 'active' : ''}`} onMouseEnter={() => setActiveSearchIndex(index)} onClick={() => selectSearchResult(item)}><span className="ticker-avatar">{item.ticker.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.ticker} · {item.exchange}</small></span><span className="search-price">{formatAssetPrice(item)}</span></button>)}</div> : <p className="no-results">No securities available. Connect a data provider.</p>}<button type="button" className="search-ask" onClick={() => runCommand(query || 'market brief')}>✳ &nbsp;Research “{query || 'the market'}”</button></div>}
        </div>
        <div className="topbar-actions"><span className="market-open"><i /> Market data <b>{marketStatus.status === 'online' ? 'Available' : marketStatus.status === 'stale' ? 'Stale' : marketStatus.status === 'loading' ? 'Connecting' : 'Offline'}</b></span><button type="button" className="icon-button" aria-label="Toggle dark mode" aria-pressed={dark} onClick={() => setDark(!dark)}>{dark ? '☀' : '◐'}</button><div className="profile-menu-wrap"><button type="button" className="avatar profile-menu-trigger" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen(open => !open)}>{profileInitials}</button>{profileMenuOpen && <div className="profile-menu" role="menu"><div className="profile-menu-identity"><strong>{profile.name}</strong><span>{profile.email || 'Local session'}</span></div><button type="button" role="menuitem" onClick={openProfileEditor}>Edit profile</button><button type="button" role="menuitem" className="profile-logout" onClick={signOut}>Log out</button></div>}</div></div>
      </header>
      {searchOpen && <button className="search-dismiss" aria-label="Close search" onClick={() => { setSearchOpen(false); setActiveSearchIndex(-1); }} />}
      <div className="layout">
        <aside className="sidebar">
          <div className="workspace-label">YOUR WORKSPACE <span aria-hidden="true">⌄</span></div>
          {NAV.map(section => <div className="nav-section" key={section.group}><p>{section.group}</p>{section.items.map(([label, symbol]) => <button key={label} type="button" aria-label={label} title={label} aria-current={page === label ? 'page' : undefined} onClick={() => goTo(label)} className={`nav-link ${page === label ? 'selected' : ''}`}><Icon>{symbol}</Icon><span>{label}</span>{label === 'Watchlist' && <small>{watchlist.length}</small>}</button>)}</div>)}
          <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">✦</span><strong>Research, made clearer.</strong><p>Start with a question. Follow the evidence.</p><button onClick={() => goTo('AI Analyst')}>Meet your analyst <span>→</span></button></div><button type="button" className="profile-row" onClick={openProfileEditor} aria-label={`Edit profile for ${profile.name}`}><div className="avatar profile-avatar">{profileInitials}</div><div><strong>{profile.name}</strong><small>Personal workspace</small></div><span aria-hidden="true">···</span></button></div>
        </aside>
        <main className="main-content" onClick={() => { if (searchOpen) { setSearchOpen(false); setActiveSearchIndex(-1); } }}>
          <div className="demo-banner"><span className="demo-pill"><i /> {marketStatus.status === 'online' ? 'FRESH PROVIDER DATA' : marketStatus.status === 'stale' ? 'STALE DATA' : marketStatus.status === 'loading' ? 'CONNECTING' : 'DATA OFFLINE'}</span><span>{marketStatus.error || (marketStatus.status === 'online' ? `${marketStatus.source} · Updated ${formatQuoteTimestamp(marketStatus.updatedAt)}` : marketStatus.status === 'stale' ? `Last provider update ${formatQuoteTimestamp(marketStatus.updatedAt)}. Verify freshness before relying on quotes.` : marketStatus.status === 'loading' ? 'Connecting to the configured market-data service…' : 'No market-data service is available. Configure the server-side API to load timestamped quotes.')}</span><button type="button" aria-label="Refresh market data now" onClick={() => setRefreshKey(key => key + 1)}>Refresh data <span>↻</span></button></div>
          {page === 'Overview' && <Overview goTo={goTo} period={period} setPeriod={setPeriod} watchlist={watchlist} toggleWatch={toggleWatch} askAnalyst={askAnalyst} prompt={prompt} setPrompt={setPrompt} setSelectedTicker={setSelectedTicker} setActiveTab={setActiveTab} userName={profile.name} marketStatus={marketStatus} />}
          {page === 'Markets' && <Markets goTo={goTo} marketStatus={marketStatus} watchlist={watchlist} toggleWatch={toggleWatch} />}
          {page === 'Assets' && <AssetsPage watchlist={watchlist} toggleWatch={toggleWatch} openAsset={openAsset} marketStatus={marketStatus} />}
          {page === 'Stocks' && <Stocks ticker={selectedTicker} activeTab={activeTab} setActiveTab={setActiveTab} watchlist={watchlist} toggleWatch={toggleWatch} period={period} setPeriod={setPeriod} />}
          {page === 'Watchlist' && <WatchlistPage watchlist={watchlist} toggleWatch={toggleWatch} goTo={goTo} openAsset={openAsset} />}
          {page === 'Screener' && <Screener sector={sector} setSector={setSector} data={filteredAssets} savedScreen={savedScreen} setSavedScreen={setSavedScreen} toggleWatch={toggleWatch} watchlist={watchlist} openAsset={openAsset} />}
          {page === 'AI Analyst' && <Analyst prompt={prompt} setPrompt={setPrompt} answer={answer} askAnalyst={askAnalyst} />}
          {page === 'Portfolio' && <Portfolio goTo={goTo} />}
          {(page === 'News' || page === 'News Intelligence') && <News />}
          {(page === 'Forecasts' || page === 'Forecast Lab') && <Forecasts />}
          {page === 'Reports' && <Reports />}
          {page === 'Settings' && <Settings dark={dark} setDark={setDark} marketStatus={marketStatus} />}
          {page === 'Market Brain' && <MarketBrain goTo={goTo} />}
          {page === 'What Changed' && <WhatChanged goTo={goTo} />}
          {page === 'Market Map' && <MarketMap goTo={goTo} setSelectedTicker={setSelectedTicker} setActiveTab={setActiveTab} />}
          {page === 'Scenario Simulator' && <ScenarioSimulator />}
          {page === 'Calculator Lab' && <FinancialCalculatorLab saveCalculation={saveCalculation} />}
          {page === 'Risk Radar' && <RiskRadar />}
          {page === 'Industry Intel' && <IndustryIntel />}
          {page === 'Learning' && <Learning />}
          {page === 'Research Workspace' && <ResearchWorkspace goTo={goTo} savedCalculations={savedCalculations} removeCalculation={removeCalculation} />}
          {page === 'Alerts' && <AlertsPage goTo={goTo} />}
        </main>
      </div>
      <nav ref={mobileNavRef} className="mobile-nav" aria-label="Mobile navigation">{[['Overview','⌂'],['Markets','◷'],['Watchlist','☆'],['Portfolio','◫'],['AI Analyst','✳']].map(([name, icon]) => <button key={name} aria-current={page === name ? 'page' : undefined} className={page === name ? 'active' : ''} onClick={() => goTo(name)}><Icon>{icon}</Icon><span>{name === 'AI Analyst' ? 'Analyst' : name}</span></button>)}<button className={mobileMenuOpen ? 'active' : ''} aria-label="More pages" aria-expanded={mobileMenuOpen} aria-controls="mobile-more-menu" onClick={() => setMobileMenuOpen(open => !open)}><Icon>☰</Icon><span>More</span></button>{mobileMenuOpen && <div id="mobile-more-menu" className="mobile-more-menu" role="menu" aria-label="More pages">{NAV.flatMap(section => section.items).filter(([name]) => !['Overview','Markets','Watchlist','Portfolio','AI Analyst'].includes(name)).map(([name,icon])=><button key={name} type="button" role="menuitem" aria-current={page === name ? 'page' : undefined} onClick={() => goTo(name)}><Icon>{icon}</Icon>{name}</button>)}</div>}</nav>
      {profileDialogOpen && <div className="profile-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileDialogOpen(false); }}><section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><div className="profile-dialog-heading"><div><span className="eyebrow">ACCOUNT PREFERENCES</span><h2 id="profile-dialog-title">Edit profile</h2></div><button type="button" className="profile-dialog-close" aria-label="Close edit profile" onClick={() => setProfileDialogOpen(false)}>×</button></div><p className="profile-dialog-copy">Update the name and email shown in this workspace. Changes are kept in this session only.</p><form className="profile-edit-form" onSubmit={event => { event.preventDefault(); const name = profileDraft.name.trim(); const email = profileDraft.email.trim(); if (!name || !email) return; setProfile({ name, email }); setProfileDialogOpen(false); }}><label>Full name<input autoComplete="name" required maxLength={80} value={profileDraft.name} onChange={event => setProfileDraft(current => ({ ...current, name: event.target.value }))} /></label><label>Email address<input type="email" autoComplete="email" required maxLength={254} value={profileDraft.email} onChange={event => setProfileDraft(current => ({ ...current, email: event.target.value }))} /></label><div className="profile-dialog-actions"><button type="button" className="outline-button" onClick={() => setProfileDialogOpen(false)}>Cancel</button><button type="submit" className="primary-button">Save changes</button></div></form><p className="profile-session-note">Local session · Profile updates are not saved to an account.</p></section></div>}
    </div>
  );
}

function formatAssetPrice(asset) { return asset.priceDisplay || new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(asset.price); }

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(value => {
    const text = String(value ?? '');
    const safeText = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PageHeading({ eyebrow, title, description, right }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{right}</div>; }
function SectionTitle({ title, sub, action }) { return <div className="section-heading"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>; }
function MetricTile({ label, value, change, note, positive }) { return <div className="metric-tile"><div className="metric-top"><span>{label}</span><span className="metric-info" aria-label={value == null ? 'Data unavailable' : 'Value calculated from current inputs'}>ⓘ</span></div><strong>{value ?? 'Unavailable'}</strong><div className={`metric-change ${value == null ? '' : positive === false ? 'down' : 'up'}`}>{value == null ? 'No verified value available' : <>{change}{note && <small>{note}</small>}</>}</div></div>; }

function Overview({ goTo, period, setPeriod, watchlist, toggleWatch, askAnalyst, prompt, setPrompt, setSelectedTicker, setActiveTab, userName, marketStatus }) {
  const listed = assets.filter(a => watchlist.includes(a.ticker));
  if (!assets.length) return <><PageHeading eyebrow="PERSONAL WORKSPACE" title={`Good morning, ${userName.trim().split(/\s+/)[0] || 'there'}`} description={marketStatus.status === 'online' ? 'The provider is connected, but it returned no securities.' : 'Your workspace is ready. Market quotes are unavailable until the provider API responds.'} right={<button className="outline-button" onClick={() => goTo('Settings')}>Data settings</button>} /><DataNotice>{marketStatus.status === 'online' ? `${marketStatus.source} returned no security records. Check provider coverage and API filters.` : marketStatus.error || 'No market-data service is currently available. Configure the server-side API to provide timestamped quotes.'}</DataNotice><section className="panel change-empty"><span className="change-empty-icon">⌁</span><span className="eyebrow">LIVE DATA STATUS</span><h2>Market information will appear here when a provider is connected</h2><p>This workspace intentionally shows no fabricated quotes, market movers, charts, or index values.</p><button className="outline-button" onClick={() => goTo('Assets')}>Browse connected securities</button></section><section className="ask-panel"><div className="ask-intro"><div className="ai-spark">✳</div><div><span className="eyebrow">RESEARCH DESK</span><h2>What do you want to research?</h2><p>Research answers are unavailable until an AI service and verified sources are connected.</p></div></div><form className="ask-form" onSubmit={event => { event.preventDefault(); askAnalyst(); }}><input aria-label="Ask the market" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Research services are not connected" /><button type="submit" disabled>Unavailable</button></form></section>  </>;
  return <>
    <PageHeading eyebrow="PERSONAL WORKSPACE · PROVIDER DATA" title={`Good morning, ${userName.trim().split(/\s+/)[0] || 'there'}`} description="Quotes below are returned by your configured market-data provider." right={<button className="outline-button" onClick={() => goTo('Assets')}>Explore securities</button>} />
    <DataNotice>{marketStatus.status === 'stale' ? `Provider data may be stale. Last update: ${formatQuoteTimestamp(marketStatus.updatedAt)}.` : `${marketStatus.source || 'Market-data provider'} · Last update: ${formatQuoteTimestamp(marketStatus.updatedAt)}.`} Check each quote timestamp before relying on it.</DataNotice>
    <section className="panel table-panel"><div className="table-title"><div><h2>Available securities <span className="count-chip">{assets.length}</span></h2><p>Source and provider timestamps are included with each quote.</p></div><button className="text-button" onClick={() => goTo('Markets')}>Open markets →</button></div><AssetTable rows={assets.slice(0, 12)} toggleWatch={toggleWatch} watchlist={watchlist} openAsset={asset => { setSelectedTicker(asset.ticker); setActiveTab('Overview'); goTo(asset.assetType === 'Equity' || !asset.assetType ? 'Stocks' : 'Assets'); }} /></section>
    <section className="panel research-note"><span className="notice-symbol">ⓘ</span><div><strong>Provider data, not investment advice</strong><p>Quotes can be delayed or revised according to your provider agreement. Confirm source, timestamp, and licensing before redistribution.</p></div></section>
  </>;
  return <>
    <PageHeading eyebrow="PERSONAL WORKSPACE · DEMO SNAPSHOT" title={`Good morning, ${userName.trim().split(/\s+/)[0] || 'there'}`} description="A clearer view of the markets, with the context to understand what matters." right={<button className="outline-button" onClick={() => goTo('Reports')}>＋ New research report</button>} />
    <section className="ask-panel"><div className="ask-intro"><div className="ai-spark">✳</div><div><span className="eyebrow">STOCKSENSE RESEARCH DESK</span><h2>What do you want to research?</h2><p>Ask about a market, company, or financial concept. Demo answers are not connected to live sources.</p></div></div><form className="ask-form" onSubmit={e => { e.preventDefault(); askAnalyst(); }}><input aria-label="Ask the market" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. What changed in Indian IT this week?"/><button aria-label="Submit question">Ask analyst <span>→</span></button></form><div className="suggestions">{questions.map(q => <button key={q} onClick={() => askAnalyst(q)}>{q} <span>↗</span></button>)}</div></section>
    <section className="daily-brief panel"><div><span className="eyebrow">MARKET BRAIN · DAILY BRIEF</span><h2>Today’s market in 60 seconds</h2><p>A sourced briefing will appear when market and news feeds are connected. StockSense does not infer real-world market drivers from sample data.</p></div><button className="outline-button" onClick={() => goTo('Market Brain')}>Open Market Brain <span>→</span></button></section>
    <SectionTitle title="Market snapshot" sub="A quick read on major Indian indices" action={<button className="text-button" onClick={() => goTo('Markets')}>Explore markets <span>→</span></button>} />
    <div className="market-grid"><MetricTile label="NIFTY 50" value="24,572.65" change="+0.62%" positive note="today"/><MetricTile label="SENSEX" value="80,787.30" change="+0.54%" positive note="today"/><MetricTile label="BANK NIFTY" value="55,246.10" change="−0.18%" positive={false} note="today"/><div className="breadth-tile"><div className="metric-top"><span>MARKET BREADTH</span><span className="breadth-label">NSE · DEMO</span></div><strong>1.4 <small>advance / decline</small></strong><div className="breadth-bar"><i /></div><div className="breadth-legend"><span><i className="green-dot"/> Advancing <b>1,248</b></span><span><i className="red-dot"/> Declining <b>884</b></span></div></div></div>
    <div className="content-grid"><section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">MARKET PERFORMANCE · DEMO</span><h2>NIFTY 50 <span className="instrument-tag">NSE</span></h2><div className="chart-price">24,572.65 <span className="positive-text">↗ +151.80 (0.62%)</span></div></div><span className="more-button" aria-hidden="true">···</span></div><div className="chart-toolbar"><div className="chart-legend"><i/> NIFTY 50</div><div className="periods">{periods.map(p => <button key={p} onClick={() => setPeriod(p)} className={period === p ? 'chosen' : ''}>{p}</button>)}</div></div><LineChart period={period}/><div className="chart-footnote"><span>Illustrative index series · Not exchange-sourced</span><span>Sample as of 15:30 IST</span></div></section>
      <section className="panel movers-panel"><div className="panel-heading"><div><span className="eyebrow">SESSION ACTIVITY · DEMO</span><h2>Stocks in focus</h2></div><button className="text-button" onClick={() => goTo('Stocks')}>View all <span>→</span></button></div><div className="mover-tabs"><span className="mover-tab-label">Top movers · demo</span><button type="button" onClick={() => goTo('Screener')}>Open screener</button></div><div className="mover-list">{assets.slice(0,4).map((item, index) => <div className="mover-row" key={item.ticker}><span className="company-mark">{item.ticker.slice(0,1)}</span><button type="button" className="mover-company mover-company-link" onClick={() => { setSelectedTicker(item.ticker); setActiveTab('Overview'); goTo('Stocks'); }}><strong>{item.ticker}</strong><small>{item.sector}</small></button><div className="mover-value"><strong>₹{item.price}</strong><span className={item.positive ? 'positive-text' : 'negative-text'}>{item.change}</span></div><button className={`watch-mini ${watchlist.includes(item.ticker) ? 'is-saved' : ''}`} onClick={() => toggleWatch(item.ticker)} aria-label={`${watchlist.includes(item.ticker) ? 'Remove' : 'Add'} ${item.ticker} ${watchlist.includes(item.ticker) ? 'from' : 'to'} watchlist`}>{watchlist.includes(item.ticker) ? '★' : '☆'}</button></div>)}</div><div className="panel-bottom-note">Sample constituents · values are simulated</div></section></div>
    <div className="lower-grid"><section className="panel watch-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR LIST</span><h2>Watchlist <span className="count-chip">{listed.length}</span></h2></div><button className="text-button" onClick={() => goTo('Watchlist')}>Manage <span>→</span></button></div>{listed.length ? <div className="watch-compact">{listed.slice(0,3).map(a => <button className="watch-compact-row" key={a.ticker} onClick={() => { setSelectedTicker(a.ticker); setActiveTab('Overview'); goTo(a.assetType ? 'Assets' : 'Stocks'); }}><span className="company-mark">{a.ticker.slice(0,1)}</span><span className="mover-company"><strong>{a.ticker}</strong><small>{a.name}</small></span><span className="mover-value"><strong>{formatAssetPrice(a)}</strong><small className={a.positive ? 'positive-text':'negative-text'}>{a.change}</small></span></button>)}</div> : <div className="empty-inline"><span>☆</span><p>Your watchlist is clear. Explore stocks to add a company.</p><button className="text-button" onClick={() => goTo('Stocks')}>Explore stocks →</button></div>}</section><section className="insight-card"><div className="insight-top"><span className="insight-icon">✳</span><span className="eyebrow">A BETTER WAY TO RESEARCH</span></div><h2>Curiosity is a good place to start.</h2><p>Explore a company, compare businesses, or make sense of a market move—with the evidence in view.</p><button onClick={() => goTo('AI Analyst')}>Open AI analyst <span>→</span></button><small>Research support, not investment advice.</small></section></div>
  </>;
}

function Markets({ goTo, marketStatus, watchlist, toggleWatch }) { const [period, setPeriod] = useState('1D'); if (assets.length) return <><PageHeading eyebrow="MARKETS · PROVIDER DATA" title="Markets at a glance" description="Securities returned by your configured data provider." right={<span className="status-off">{marketStatus.status === 'stale' ? 'Data may be stale' : 'Timestamped quotes'}</span>} /><DataNotice>{marketStatus.source || 'Market-data provider'} · Last update: {formatQuoteTimestamp(marketStatus.updatedAt)}. Index, breadth, and history data are not shown unless supplied by a dedicated endpoint.</DataNotice><section className="panel table-panel"><div className="table-title"><div><h2>Provider securities <span className="count-chip">{assets.length}</span></h2><p>Quote source and timestamp are listed per instrument.</p></div></div><AssetTable rows={assets} toggleWatch={toggleWatch} watchlist={watchlist} /></section></>; if (!assets.length) return <><PageHeading eyebrow="MARKETS" title="Markets at a glance" description="Market data is unavailable until a provider is connected." /><DataNotice>No index values, sector movements, or breadth figures are bundled in this frontend.</DataNotice><section className="panel change-empty"><h2>Connect market data to view markets</h2><p>Use a licensed market-data vendor and a server-side API to supply timestamped quotes and history.</p></section></>; return <><PageHeading eyebrow="MARKETS · INDIA" title="Markets at a glance" description="A broad view of index performance and market participation." right={<span className="timestamp-tag"><i/> Demo session · Sample timestamp</span>} /><div className="market-grid market-grid-page"><MetricTile label="NIFTY 50" value="24,572.65" change="+0.62%" positive note="today"/><MetricTile label="SENSEX" value="80,787.30" change="+0.54%" positive note="today"/><MetricTile label="BANK NIFTY" value="55,246.10" change="−0.18%" positive={false} note="today"/><MetricTile label="INDIA VIX" value="14.32" change="−2.10%" positive note="today"/></div><div className="content-grid markets-content"><section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">INDEX · ILLUSTRATIVE SERIES</span><h2>NIFTY 50</h2></div></div><div className="chart-price">24,572.65 <span className="positive-text">↗ +0.62%</span></div><div className="periods market-periods">{periods.map(p=><button key={p} onClick={()=>setPeriod(p)} className={period===p?'chosen':''}>{p}</button>)}</div><LineChart period={period}/><p className="disclaimer-line">This chart uses deterministic demo values. No live exchange connection is available.</p></section><section className="panel"><SectionTitle title="Sector pulse" sub="Illustrative daily movement"/><div className="sector-list">{[['Technology','+1.24%'],['Healthcare','+0.86%'],['Energy','+0.52%'],['Financials','+0.18%'],['Automotive','−0.44%'],['Consumer','−0.67%']].map(([n,v])=><div className="sector-row" key={n}><span>{n}</span><div className="sector-track"><i style={{width:`${Math.min(parseFloat(v.replace(/[+−%]/g,''))*35+18, 75)}%`}} className={v.startsWith('−')?'negative-track':''}/></div><strong className={v.startsWith('−')?'negative-text':'positive-text'}>{v}</strong></div>)}</div></section></div><div className="panel breadth-detail"><SectionTitle title="Market breadth" sub="Advance/decline participation · demo snapshot"/><div className="breadth-large"><strong>1,248</strong><span>Advancing</span><div className="breadth-bar"><i/></div><strong>884</strong><span>Declining</span></div></div></>; }

function Stocks({ ticker, activeTab, setActiveTab, watchlist, toggleWatch, period, setPeriod }) {
  const stock = assets.find(asset => asset.ticker === ticker);
  const tabs = ['Overview','Chart','Fundamentals','Financials','Technicals','News','Forecast','Valuation','Competitors','Ownership','Events','Reports'];
  const [selectedHealth, setSelectedHealth] = useState(null);
  if (!stock) return <><PageHeading eyebrow="SECURITY RESEARCH" title="No security data available" description="Search and company research require a connected securities directory." /><DataNotice>No securities are currently available from the configured provider. Check the provider API and access permissions.</DataNotice><section className="panel change-empty"><h2>No securities to display</h2><p>The company directory is intentionally empty until a live or licensed data source is configured.</p></section></>;
  const healthDimensions = [
    { name: 'Growth', metrics: 'Revenue · EPS · free cash flow', explanation: 'Growth metrics compare financial performance across reporting periods. A consistent period and accounting basis are essential for a fair comparison.', formula: 'Growth = (Current period − Prior period) ÷ Prior period' },
    { name: 'Profitability', metrics: 'Margins · ROE · ROCE', explanation: 'Profitability shows how effectively a business converts sales and capital into earnings. Interpret ratios in the context of its industry and accounting period.', formula: 'ROE = Net income ÷ Average shareholder equity' },
    { name: 'Financial health', metrics: 'Debt · cash · liquidity', explanation: 'Financial health considers the company’s ability to meet obligations and fund its operations. No verified company financial statements are connected.', formula: 'Debt-to-equity = Total debt ÷ Shareholders’ equity' },
    { name: 'Valuation', metrics: 'P/E · P/B · EV/EBITDA', explanation: 'Valuation ratios relate a company’s market value to financial measures. They are not meaningful without current prices, dated financials, and peer context.', formula: 'P/E = Market price per share ÷ Earnings per share' },
    { name: 'Momentum', metrics: 'Price trend · relative strength · volume', explanation: 'Momentum describes observed price and volume behavior over a defined historical window. It does not indicate what a price will do next.', formula: 'Indicators require timestamped historical price and volume data' },
    { name: 'Stability', metrics: 'Earnings · revenue · volatility', explanation: 'Stability looks at variability in financial results and market behavior over time. It should be assessed across multiple business cycles.', formula: 'Stability requires comparable multi-period financial and price history' },
  ];
  return <><PageHeading eyebrow="COMPANY RESEARCH · PROVIDER QUOTE" title={stock.name} description={`${stock.ticker} · ${stock.exchange} · ${stock.sector}`} right={<button className="outline-button" onClick={()=>toggleWatch(stock.ticker)}>{watchlist.includes(stock.ticker)?'★ In watchlist':'☆ Add to watchlist'}</button>}/><div className="stock-price-line"><strong>{formatAssetPrice(stock)}</strong><span className={stock.positive?'positive-text':'negative-text'}>{stock.positive?'↗':'↘'} {stock.change} today</span><small>{stock.source} · {formatQuoteTimestamp(stock.asOf)}</small></div><div className="stock-tabs" role="tablist" aria-label={`${stock.name} research sections`}>{tabs.map(t=><button key={t} role="tab" aria-selected={activeTab===t} onClick={()=>setActiveTab(t)} className={activeTab===t?'selected':''}>{t}</button>)}</div>{activeTab !== 'Overview' && <section className="panel tab-unavailable" role="status"><span className="eyebrow">{activeTab.toUpperCase()} · DATA STATUS</span><h2>{activeTab} research is not connected</h2><p>This section requires verified, timestamped provider data and is not available in the current frontend. No section-specific analysis is being shown.</p><span className="status-off">No provider connected</span></section>}<div hidden={activeTab !== 'Overview'}><section className="health-dna" aria-labelledby="health-dna-title"><div className="health-dna-heading"><div><span className="eyebrow">COMPANY INTELLIGENCE</span><h2 id="health-dna-title">Company health DNA</h2><p>Separate research dimensions—not a single score or recommendation.</p></div><span className="status-off">Verified data unavailable</span></div><div className="health-dimensions">{healthDimensions.map(dimension=><button type="button" key={dimension.name} className={`health-dimension ${selectedHealth?.name===dimension.name?'active':''}`} aria-expanded={selectedHealth?.name===dimension.name} onClick={()=>setSelectedHealth(selectedHealth?.name===dimension.name?null:dimension)}><span><strong>{dimension.name}</strong><span className="health-detail-link">Why? <span aria-hidden="true">↗</span></span></span><small>{dimension.metrics}</small><em>Not supplied by the quote endpoint</em></button>)}</div>{selectedHealth&&<div className="health-explanation" role="region" aria-label={`${selectedHealth.name} explanation`}><div><span className="eyebrow">WHY THIS DIMENSION MATTERS</span><h3>{selectedHealth.name}</h3><p>{selectedHealth.explanation}</p><div className="health-formula"><strong>How it is assessed</strong><span>{selectedHealth.formula}</span></div></div><div className="health-source"><span className="status-off">No provider connected</span><p>Historical trend, peer comparison, and source citations will appear when verified financial data is available.</p><button type="button" className="text-button" onClick={()=>setSelectedHealth(null)}>Close explanation ×</button></div></div>}</section><div className="content-grid stock-content"><section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">PRICE HISTORY · PROVIDER SERIES NOT CONNECTED</span><h2>{activeTab === 'Overview' ? 'Price history' : activeTab}</h2></div><span className="instrument-tag">NSE</span></div><div className="periods market-periods">{periods.map(p=><button key={p} onClick={()=>setPeriod(p)} className={period===p?'chosen':''}>{p}</button>)}</div><LineChart period={period}/><p className="disclaimer-line">Historical price series are not included in the quote endpoint.</p></section><section className="panel"><SectionTitle title="Data availability" sub="Check provenance before interpreting a number"/><div className="snapshot-list"><div><span>Instrument</span><strong>{stock.ticker} · {stock.exchange}</strong></div><div><span>Asset class</span><strong>{stock.assetType || 'Equity'}</strong></div><div><span>Quote status</span><strong>{stock.source} · {formatQuoteTimestamp(stock.asOf)}</strong></div><div><span>Financial statements</span><strong>Not connected</strong></div><div><span>Quote timestamp</span><strong>{formatQuoteTimestamp(stock.asOf)}</strong></div></div><p className="disclaimer-line">This quote is supplied by the configured provider. Confirm its licensing, exchange coverage, and delay status.</p><button className="outline-button full-button" onClick={()=>setActiveTab('Fundamentals')}>View fundamentals section <span>→</span></button></section></div><div className="three-metrics company-data-status"><div className="panel forecast-placeholder"><span className="eyebrow">FINANCIAL HISTORY</span><strong>Not connected</strong><p>Verified statements are required to calculate trends.</p></div><div className="panel forecast-placeholder"><span className="eyebrow">PEER COMPARISON</span><strong>Not available</strong><p>Comparable, dated company data is not configured.</p></div><div className="panel forecast-placeholder"><span className="eyebrow">SOURCE CITATIONS</span><strong>No provider</strong><p>No primary-source documents are connected.</p></div></div><div className="panel research-note"><span className="notice-symbol">ⓘ</span><div><strong>Interpret metrics in context</strong><p>Ratios vary by industry, accounting period, and data source. StockSense will show company metrics when verified disclosures and their timestamps are available.</p></div><button className="text-button" onClick={()=>setActiveTab('Fundamentals')}>How to read fundamentals →</button></div></div></>; }

function AssetsPage({ watchlist, toggleWatch, openAsset, marketStatus }) {
  const [type, setType] = useState('All assets');
  const types = ['All assets', 'Equity', 'Commodity', 'Crypto', 'Bond'];
  const rows = assets.filter(asset => type === 'All assets' || (asset.assetType || 'Equity') === type);
  return <><PageHeading eyebrow="CROSS-ASSET RESEARCH" title="Explore asset classes" description="Browse timestamped securities returned by the configured provider." right={<span className="status-off">{marketStatus.status === 'online' ? 'Provider connected' : marketStatus.status === 'stale' ? 'Data may be stale' : 'Provider unavailable'}</span>} /><div className="asset-type-tabs" role="tablist" aria-label="Filter asset class">{types.map(item => <button key={item} role="tab" aria-selected={type === item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>{item}</button>)}</div><div className="notice-strip">{marketStatus.status === 'online' ? `${marketStatus.source} · Updated ${formatQuoteTimestamp(marketStatus.updatedAt)}.` : marketStatus.error || 'No securities are available. Configure the server-side market-data API.'}</div><div className="panel table-panel asset-table-panel"><div className="table-title"><div><h2>{type} <span className="count-chip">{rows.length}</span></h2><p>Provider and timestamp will be shown with each connected quote.</p></div></div><AssetTable rows={rows} toggleWatch={toggleWatch} watchlist={watchlist} openAsset={openAsset} /></div></>;
}

function WatchlistPage({ watchlist, toggleWatch, goTo, openAsset }) { const selected=assets.filter(a=>watchlist.includes(a.ticker)); return <><PageHeading eyebrow="YOUR WORKSPACE" title="Watchlist" description="Keep an eye on companies you’re researching." right={<button className="outline-button" onClick={()=>goTo('Stocks')}>＋ Add a company</button>}/>{selected.length ? <div className="panel table-panel"><div className="table-title"><div><h2>Saved companies</h2><p>Latest provider quotes are shown below.</p></div><span className="count-chip">{selected.length} saved</span></div><AssetTable rows={selected} toggleWatch={toggleWatch} watchlist={watchlist} openAsset={openAsset}/></div> : <div className="empty-state panel"><span className="empty-star">☆</span><h2>Your watchlist is empty</h2><p>Connect a securities provider before adding instruments or viewing market quotes.</p><button className="primary-button" onClick={()=>goTo('Stocks')}>Explore companies <span>→</span></button></div>}<div className="notice-strip">ⓘ &nbsp;Price alerts and news notifications require a connected provider.</div></>; }

function AssetTable({ rows, toggleWatch, watchlist, openAsset }) { return <div className="table-scroll"><table><thead><tr><th>ASSET</th><th>TYPE</th><th>SECTOR</th><th>QUOTE</th><th>CHANGE</th><th>SOURCE · TIME</th><th></th></tr></thead><tbody>{rows.map(a=>{const saved=watchlist.includes(a.ticker);return <tr key={a.ticker}><td>{openAsset && (!a.assetType || a.assetType === 'Equity') ? <button type="button" className="table-company table-company-button" onClick={() => openAsset(a)} aria-label={`Open research for ${a.name}`}><span className="company-mark">{a.ticker[0]}</span><span><strong>{a.name}</strong><small>{a.ticker}</small></span></button> : <div className="table-company"><span className="company-mark">{a.ticker[0]}</span><span><strong>{a.name}</strong><small>{a.ticker}</small></span></div>}</td><td>{a.assetType || 'Equity'}</td><td>{a.sector}</td><td className="number-cell">{formatAssetPrice(a)}</td><td className={a.positive?'positive-text':'negative-text'}>{a.positive?'↗':'↘'} {a.change} <span className="sr-only">{a.positive?'positive':'negative'}</span></td><td title={`${a.source} · ${formatQuoteTimestamp(a.asOf)}`}>{a.source} · {formatQuoteTimestamp(a.asOf)}</td><td><button className={`watch-mini ${saved?'is-saved':''}`} onClick={()=>toggleWatch(a.ticker)} aria-label={`${saved?'Remove':'Add'} ${a.ticker} ${saved?'from':'to'} watchlist`}>{saved?'★':'☆'}</button></td></tr>;})}</tbody></table></div>; }

function Screener({ sector, setSector, data, savedScreen, setSavedScreen, toggleWatch, watchlist, openAsset }) { return <><PageHeading eyebrow="DISCOVER · PROVIDER DATA" title="Stock screener" description="Filter securities returned by your configured provider." right={<button className="outline-button" aria-pressed={Boolean(savedScreen)} title={savedScreen ? `Saved locally: ${savedScreen.sector}` : 'Save the current sector filter in this browser'} onClick={()=>setSavedScreen(savedScreen ? null : {sector})}>{savedScreen?'✓ Saved in browser':'♡ Save this screen'}</button>}/><div className="panel filter-panel"><div className="filter-heading"><div><h2>Build a screen</h2><p>Filters apply to securities returned by the connected provider.</p></div><span className="demo-pill compact">PROVIDER UNIVERSE</span></div><div className="filter-controls"><label>Sector<select value={sector} onChange={e=>setSector(e.target.value)}>{['All sectors','Technology','Energy','Financials','Automotive'].map(x=><option key={x}>{x}</option>)}</select></label><label>Revenue growth<select disabled aria-label="Revenue growth filter unavailable in demo"><option>Unavailable in demo</option></select></label><label>Market cap<select disabled aria-label="Market cap filter unavailable in demo"><option>Unavailable in demo</option></select></label><button className="filter-add" onClick={()=>setSector('All sectors')}>Clear filters</button></div><div className="filter-chips"><span>Provider securities</span><span>Quotes include source timestamps</span></div></div><div className="panel table-panel"><div className="table-title"><div><h2>Companies <span className="count-chip">{data.length}</span></h2><p>No quote data is displayed until a provider is connected.</p></div><button className="text-button" onClick={()=>setSector('All sectors')}>Reset filters</button></div><AssetTable rows={data} toggleWatch={toggleWatch} watchlist={watchlist} openAsset={openAsset}/></div></>; }

function Analyst({ prompt, setPrompt, answer, askAnalyst }) { return <><PageHeading eyebrow="RESEARCH ASSISTANT" title="AI market analyst" description="Explore a question. Separate evidence from interpretation."/><div className="analyst-layout"><section className="panel analyst-main"><div className="analyst-welcome"><div className="ai-spark">✳</div><div><span className="eyebrow">STOCKSENSE RESEARCH</span><h2>What would you like to understand?</h2><p>Ask about a company, market movement, or financial concept.</p></div></div><form className="ask-form analyst-form" onSubmit={e=>{e.preventDefault();askAnalyst();}}><input value={prompt} onChange={e=>setPrompt(e.target.value)} aria-label="Question for analyst" placeholder="Ask a research question..."/><button>Ask analyst <span>→</span></button></form><div className="analyst-suggestions"><span className="eyebrow">TRY ASKING</span>{['What should I look at when comparing two banks?','Explain how interest rates can affect equities','What are the risks of relying on P/E alone?'].map(q=><button key={q} onClick={()=>askAnalyst(q)}>{q}<span>↗</span></button>)}</div>{answer && <div className="answer-block" aria-live="polite" aria-atomic="true"><div className="answer-label"><span>✳</span> RESEARCH RESPONSE <small>Demo assistant · no live tools connected</small></div><p>{answer}</p><div className="response-caveat">ⓘ This is a general research explanation, not personalized financial advice. Verify information against primary sources.</div></div>}{!answer && <div className="analyst-empty"><span>⌁</span><strong>Your research response will appear here</strong><p>No AI model or external financial data service is connected.</p></div>}</section><aside className="panel analyst-side"><span className="eyebrow">BUILT FOR CLARITY</span><h3>Evidence before conclusions.</h3><div className="trust-item"><span>01</span><div><strong>Facts</strong><p>Source-backed information with dates and context.</p></div></div><div className="trust-item"><span>02</span><div><strong>Interpretation</strong><p>Reasoning separated from reported data.</p></div></div><div className="trust-item"><span>03</span><div><strong>Uncertainty</strong><p>Models are estimates, never guarantees.</p></div></div><div className="disclaimer-card">Demo mode means no live market retrieval, sourced claims, or investment recommendations.</div></aside></div></>; }

function Portfolio({ goTo }) {
  const equityAssets = assets.filter(asset => (!asset.assetType || asset.assetType === 'Equity') && asset.currency === 'INR');
  const validHoldings = value => Array.isArray(value) && value.length <= 500 &&
    new Set(value.map(holding => holding?.id)).size === value.length &&
    value.every(holding =>
      holding && typeof holding.id === 'string' && holding.id.length > 0 &&
      validTicker(holding.ticker) &&
      Number.isFinite(holding.quantity) && holding.quantity > 0 && holding.quantity <= 1e12 &&
      Number.isFinite(holding.purchasePrice) && holding.purchasePrice > 0 && holding.purchasePrice <= 1e12 &&
      Number.isFinite(holding.quantity * holding.purchasePrice) &&
      isValidDateOnly(holding.purchaseDate)
    );
  const [holdings, setHoldings] = useState(() => readLocalValue('stocksense:portfolio', [], validHoldings));
  const [ticker, setTicker] = useState(equityAssets[0]?.ticker || '');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [formNotice, setFormNotice] = useState('');

  useEffect(() => writeLocalValue('stocksense:portfolio', holdings), [holdings]);
  useEffect(() => {
    if (!equityAssets.some(asset => asset.ticker === ticker)) setTicker(equityAssets[0]?.ticker || '');
  }, [equityAssets, ticker]);

  if (!equityAssets.length) return <><PageHeading eyebrow="YOUR WORKSPACE" title="Portfolio overview" description="Portfolio valuation requires connected securities and live quotes." /><DataNotice>No market values are available. Connect a securities provider before tracking current portfolio value.</DataNotice><section className="panel change-empty"><h2>Portfolio valuation is unavailable</h2><p>This page will not use fabricated prices or show zero-valued positions as if they were real quotes.</p></section></>;

  const pricedHoldings = holdings.map(holding => {
    const asset = equityAssets.find(item => item.ticker === holding.ticker);
    const currentPrice = asset ? asset.price : 0;
    const invested = holding.quantity * holding.purchasePrice;
    const currentValue = holding.quantity * currentPrice;
    return { ...holding, asset, currentPrice, invested, currentValue, pnl: currentValue - invested };
  }).filter(holding => holding.asset);
  const investedTotal = pricedHoldings.reduce((total, holding) => total + holding.invested, 0);
  const currentTotal = pricedHoldings.reduce((total, holding) => total + holding.currentValue, 0);
  const pnlTotal = currentTotal - investedTotal;
  const returnPercent = investedTotal ? (pnlTotal / investedTotal) * 100 : 0;
  const money = value => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const exportPositions = () => downloadCsv('stocksense-portfolio.csv', [
    ['Security', 'Ticker', 'Quantity', 'Average cost (INR)', 'Provider quote (INR)', 'Market value (INR)', 'Unrealized P&L (INR)', 'Allocation (%)', 'Purchase date'],
    ...pricedHoldings.map(holding => [
      holding.asset.name,
      holding.ticker,
      holding.quantity,
      holding.purchasePrice,
      holding.currentPrice,
      holding.currentValue,
      holding.pnl,
      currentTotal ? ((holding.currentValue / currentTotal) * 100).toFixed(2) : '0.00',
      holding.purchaseDate
    ])
  ]);

  const addHolding = event => {
    event.preventDefault();
    const units = Number(quantity);
    const cost = Number(purchasePrice);
    if (!equityAssets.some(asset => asset.ticker === ticker) || !Number.isFinite(units) || units <= 0 || units > 1e12 || !Number.isFinite(cost) || cost <= 0 || cost > 1e12 || !isValidDateOnly(purchaseDate) || purchaseDate > getLocalDateOnly() || !Number.isFinite(units * cost)) {
      setFormNotice('Enter a valid security, positive quantity and price, and a real purchase date that is not in the future.');
      return;
    }
    if (holdings.length >= 500) {
      setFormNotice('This demo portfolio is limited to 500 positions.');
      return;
    }
    setHoldings(current => [...current, { id: `${Date.now()}-${ticker}-${Math.random().toString(36).slice(2, 10)}`, ticker, quantity: units, purchasePrice: cost, purchaseDate }]);
    setQuantity('');
    setPurchasePrice('');
    setPurchaseDate('');
    setFormNotice('Holding added to this browser’s demo portfolio.');
  };

  return <>
    <PageHeading eyebrow="YOUR WORKSPACE · BROWSER-LOCAL" title="Portfolio overview" description="Track positions and cost basis against provider quotes." right={<button className="outline-button" onClick={() => goTo('Stocks')}>Explore companies</button>} />
    <DataNotice>Portfolio entries are stored only in this browser. Current values use provider quotes; check source timestamps and delay terms.</DataNotice>
    <div className="three-metrics portfolio-metrics">
      <MetricTile label="Invested amount" value={money(investedTotal)} change={`${pricedHoldings.length} position${pricedHoldings.length === 1 ? '' : 's'}`} positive note="cost basis" />
      <MetricTile label="Provider quote value" value={money(currentTotal)} change="Demo quotes" positive note="not live" />
      <MetricTile label="Unrealized P&L" value={money(pnlTotal)} change={`${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%`} positive={pnlTotal >= 0} note="illustrative" />
    </div>
    <section className="panel portfolio-entry-panel">
      <div className="panel-heading"><div><span className="eyebrow">LOCAL PORTFOLIO INPUT</span><h2>Add a holding</h2></div></div>
      <form className="portfolio-entry-form" onSubmit={addHolding}>
        <label>Security<select value={ticker} onChange={event => setTicker(event.target.value)}>{equityAssets.map(asset => <option key={asset.ticker} value={asset.ticker}>{asset.name} ({asset.ticker})</option>)}</select></label>
        <label>Quantity<input type="number" inputMode="decimal" min="0.001" max="1000000000000" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="e.g. 10" required /></label>
        <label>Purchase price<input type="number" inputMode="decimal" min="0.01" max="1000000000000" step="0.01" value={purchasePrice} onChange={event => setPurchasePrice(event.target.value)} placeholder="₹ per share" required /></label>
        <label>Purchase date<input type="date" max={getLocalDateOnly()} value={purchaseDate} onChange={event => setPurchaseDate(event.target.value)} required /></label>
        <button className="primary-button" type="submit">Add holding <span>＋</span></button>
      </form>
      {formNotice && <p className="portfolio-form-notice" role="status">{formNotice}</p>}
    </section>
    {pricedHoldings.length ? <section className="panel table-panel portfolio-holdings-panel">
      <div className="table-title"><div><h2>Positions <span className="count-chip">{pricedHoldings.length}</span></h2><p>Returns compare cost basis with simulated current quotes; fees, taxes, and cash are excluded.</p></div><button type="button" className="outline-button" onClick={exportPositions}>Export CSV</button></div>
      <div className="table-scroll"><table><thead><tr><th>SECURITY</th><th>QUANTITY</th><th>AVG. COST</th><th>DEMO PRICE</th><th>MARKET VALUE</th><th>UNREALIZED P&amp;L</th><th>ALLOCATION</th><th></th></tr></thead><tbody>{pricedHoldings.map(holding => <tr key={holding.id}><td><div className="table-company"><span className="company-mark">{holding.ticker[0]}</span><span><strong>{holding.asset.name}</strong><small>{holding.ticker} · {holding.asset.sector}</small></span></div></td><td>{holding.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td><td className="number-cell">{money(holding.purchasePrice)}</td><td className="number-cell">{money(holding.currentPrice)}</td><td className="number-cell">{money(holding.currentValue)}</td><td className={holding.pnl >= 0 ? 'positive-text' : 'negative-text'}>{holding.pnl >= 0 ? '↗ +' : '↘ '}{money(Math.abs(holding.pnl))}<span className="sr-only">{holding.pnl >= 0 ? 'gain' : 'loss'}</span></td><td>{currentTotal ? `${((holding.currentValue / currentTotal) * 100).toFixed(1)}%` : '—'}</td><td><button type="button" className="watch-mini" aria-label={`Remove ${holding.asset.name} holding`} onClick={() => setHoldings(current => current.filter(item => item.id !== holding.id))}>×</button></td></tr>)}</tbody></table></div>
    </section> : <section className="empty-state panel"><span className="empty-star">◫</span><h2>Your portfolio starts with a position</h2><p>Add a quantity, purchase price, and date above. Sample values are used only to illustrate portfolio calculations.</p></section>}
    <div className="notice-strip">This browser-local tool is for interface demonstration only; it does not connect to an account, execute trades, or retrieve live valuations.</div>
  </>;
}

function News() { return <><PageHeading eyebrow="INTELLIGENCE · SOURCES MATTER" title="News & events" description="Follow company, sector, and market developments with provenance in view."/><div className="notice-strip">ⓘ &nbsp;No news provider is connected. Articles are intentionally not fabricated.</div><div className="news-empty panel"><div className="news-symbol">▧</div><span className="eyebrow">NO SOURCE FEED CONNECTED</span><h2>News should be traceable.</h2><p>When a provider is configured, each item can include its original publisher, publication time, company context, and a link to the source.</p><div className="news-tags"><span>Company announcements</span><span>Earnings</span><span>Regulatory filings</span><span>Sector news</span></div></div></>; }
function Forecasts() { return <><PageHeading eyebrow="QUANTITATIVE RESEARCH" title="Forecasts & scenarios" description="Probabilistic estimates require validated data and a documented model."/><div className="forecast-caution"><span>ⓘ</span><div><strong>Forecasts are unavailable in this demo</strong><p>No trained model, historical dataset, or calibrated forecast service is connected. We won’t invent a probability or price target.</p></div></div><div className="three-metrics forecast-metrics"><div className="panel forecast-placeholder"><span className="eyebrow">MODEL STATUS</span><strong>Not connected</strong><p>Model version and training window unavailable.</p></div><div className="panel forecast-placeholder"><span className="eyebrow">VALIDATION</span><strong>Not available</strong><p>Backtest and calibration results require verified history.</p></div><div className="panel forecast-placeholder"><span className="eyebrow">DATA FRESHNESS</span><strong>No feed</strong><p>No live or historical provider is configured.</p></div></div><div className="notice-strip">A future forecast should show scenarios, uncertainty ranges, timestamp, features, and limitations—not certainty.</div></>; }
function Reports() { return <><PageHeading eyebrow="RESEARCH OUTPUT" title="Research reports" description="Build structured, source-aware research you can revisit." right={<button className="outline-button" onClick={()=>window.print()}>Print this page</button>}/><div className="report-builder panel"><div className="report-icon">▣</div><div><span className="eyebrow">COMPANY RESEARCH</span><h2>Start a research report</h2><p>Choose a company to begin. The current demo can show report structure but cannot populate claims from verified data.</p><button className="primary-button" onClick={()=>window.print()}>View print layout <span>→</span></button></div></div><div className="report-sections panel"><SectionTitle title="A complete report includes" sub="Traceable evidence, clear assumptions, and honest limitations"/><div className="report-grid">{['Company overview','Business model','Financial performance','Fundamentals & valuation','Industry & competitors','Technical context','Recent news & events','Risks & scenarios','Sources & methodology'].map((item,i)=><div key={item}><span>{String(i+1).padStart(2,'0')}</span>{item}</div>)}</div></div></>; }
function Settings({ dark, setDark, marketStatus }) { return <><PageHeading eyebrow="PREFERENCES" title="Settings" description="Customize your research workspace."/><section className="panel settings-panel"><div className="setting-row"><div><strong>Appearance</strong><p>Choose a comfortable theme for your workspace.</p></div><button className="outline-button" onClick={()=>setDark(!dark)}>{dark?'Switch to light':'Switch to dark'} mode</button></div><div className="setting-row"><div><strong>Market quote connection</strong><p>{marketStatus.status === 'online' ? `${marketStatus.source} · updated ${formatQuoteTimestamp(marketStatus.updatedAt)}` : marketStatus.status === 'stale' ? `Last update ${formatQuoteTimestamp(marketStatus.updatedAt)}; data may be stale.` : 'Configure a server endpoint at /api/market/securities. See README.md for the response contract.'}</p></div><span className="status-off">{marketStatus.status === 'online' ? 'Connected' : marketStatus.status === 'stale' ? 'Stale' : marketStatus.status === 'loading' ? 'Connecting' : 'Offline'}</span></div><div className="setting-row"><div><strong>Local preferences</strong><p>Theme, watchlist, and the saved screener filter are stored only in this browser. They are not synced to an account or server.</p></div><span className="status-off">Browser only</span></div><div className="setting-row"><div><strong>Additional data feeds</strong><p>News, historical charts, fundamentals, and filings require separate provider endpoints.</p></div><span className="status-off">Not connected</span></div><div className="setting-row"><div><strong>Research and safety</strong><p>Information is educational and does not constitute financial advice.</p></div><span className="status-off">Informational</span></div></section></>; }

function DataNotice({ children = 'No live market, news, or model provider is connected.' }) {
  return <div className="data-trust-note"><span className="status-off">DATA STATUS</span><span>{children}</span></div>;
}

function MarketBrain({ goTo }) {
  return <>
    <PageHeading eyebrow="DISCOVER · MARKET INTELLIGENCE" title="Market Brain" description="A single view for market context, important events, and explainable research." right={<span className="status-off">Data ingestion · Not connected</span>} />
    <DataNotice>Market pulse and event intelligence require connected, timestamped data sources. This workspace will not invent current developments.</DataNotice>
    <div className="brain-grid">
      <section className="panel brain-pulse"><div className="brain-section-head"><div><span className="eyebrow">MARKET PULSE</span><h2>Context before conclusions</h2></div><span className="status-off">Awaiting provider</span></div><div className="pulse-list">{[['Direction','No verified index feed'],['Breadth','No participation data'],['Volatility','No volatility series'],['Momentum','No timestamped history'],['Sector rotation','No sector feed']].map(([label,value])=><div className="pulse-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
      <section className="panel brain-brief"><span className="eyebrow">TODAY IN 60 SECONDS</span><h2>Briefing is not available yet</h2><p>Connect licensed market and news sources to build a sourced briefing with publication times, linked events, and related securities.</p><button className="outline-button" onClick={() => goTo('Settings')}>Review data status <span>→</span></button></section>
    </div>
    <section className="panel event-empty"><div className="event-empty-mark">⌁</div><div><span className="eyebrow">IMPORTANT DEVELOPMENTS</span><h2>No verified events to show</h2><p>Events will appear here only when a source feed is connected. Each item will separate reported facts from possible market relevance.</p></div><button className="text-button" onClick={() => goTo('News Intelligence')}>Open News Intelligence →</button></section>
    <div className="trust-legend"><strong>Trust labels</strong><span><b>FACT</b> · Provider-reported data</span><span><b>ANALYSIS</b> · Interpretation, not certainty</span><span><b>MODEL</b> · Estimate with uncertainty</span></div>
  </>;
}

function WhatChanged({ goTo }) {
  return <>
    <PageHeading eyebrow="PERSONAL INTELLIGENCE" title="What changed?" description="A useful before-and-after view requires a saved snapshot and verified updates." />
    <DataNotice>There is no previous visit snapshot or connected market feed in this session.</DataNotice>
    <section className="panel change-empty"><span className="change-empty-icon">↗</span><span className="eyebrow">SINCE YOUR LAST VISIT</span><h2>Your change log starts with connected data</h2><p>Once a provider and saved research are configured, StockSense can compare price, earnings, news, valuation, ownership, and risk against a timestamped prior snapshot.</p><div className="change-categories">{['Price','Fundamentals','News','Earnings','Valuation','Risk'].map(label=><span key={label}>{label}<small>Not connected</small></span>)}</div><button className="primary-button" onClick={() => goTo('Watchlist')}>Open watchlist <span>→</span></button></section>
  </>;
}

function MarketMap({ goTo, setSelectedTicker, setActiveTab }) {
  return <>
    <PageHeading eyebrow="DISCOVER · CROSS-ASSET MAP" title="Market map" description="Explore provider-supplied securities by asset class." right={<span className="status-off">Provider data</span>} />
    <DataNotice>Tiles are equally sized and do not represent market capitalization. Quote source and timestamp are provided by the configured API.</DataNotice>
    <div className="market-map-grid">{assets.map(asset=><button className="map-tile" key={asset.ticker} onClick={()=>{setSelectedTicker(asset.ticker);setActiveTab('Overview');goTo(asset.assetType && asset.assetType !== 'Equity' ? 'Assets' : 'Stocks');}}><span className="map-tile-top"><span className="company-mark">{asset.ticker[0]}</span><span className="map-type">{asset.assetType || 'Equity'}</span></span><strong>{asset.name}</strong><small>{asset.ticker} · {asset.sector}</small><span className={`map-price ${asset.positive?'positive-text':'negative-text'}`}>{formatAssetPrice(asset)} <b>{asset.positive?'↗':'↘'} {asset.change}</b></span></button>)}</div>
  </>;
}

function ScenarioSimulator() {
  const [growth, setGrowth] = useState(10);
  const [margin, setMargin] = useState(15);
  const [multiple, setMultiple] = useState(20);
  const [base, setBase] = useState(100);
  const result = base * (1 + growth / 100) * (margin / 15) * (multiple / 20);
  const scenarios = [{label:'Bear sensitivity',value:result*.8,detail:'Output 20% below the selected assumptions'},{label:'Base assumptions',value:result,detail:'Calculated directly from the inputs below'},{label:'Bull sensitivity',value:result*1.2,detail:'Output 20% above the selected assumptions'}];
  return <>
    <PageHeading eyebrow="FORECAST · USER-DEFINED INPUTS" title="Scenario simulator" description="Explore how changing assumptions affects a normalized output—not a price target or forecast." />
    <DataNotice>All inputs are illustrative user assumptions. No company financials or prediction model are connected.</DataNotice>
    <div className="scenario-layout"><section className="panel scenario-controls"><div className="panel-heading"><div><span className="eyebrow">INPUTS · ASSUMPTIONS</span><h2>Adjust one variable at a time</h2></div><button className="text-button" onClick={()=>{setGrowth(10);setMargin(15);setMultiple(20);setBase(100);}}>Reset assumptions</button></div>
      <label className="scenario-field">Normalized starting earnings <span>{base.toFixed(0)} units</span><input type="range" min="50" max="200" step="5" value={base} onChange={e=>setBase(Number(e.target.value))}/><small>Index baseline chosen for demonstration; not reported company earnings.</small></label>
      <label className="scenario-field">Revenue growth assumption <span>{growth}%</span><input type="range" min="-20" max="40" value={growth} onChange={e=>setGrowth(Number(e.target.value))}/><small>Illustrative assumption, not a sourced estimate.</small></label>
      <label className="scenario-field">Profit margin assumption <span>{margin}%</span><input type="range" min="5" max="30" value={margin} onChange={e=>setMargin(Number(e.target.value))}/><small>Compared against a 15% normalized reference margin.</small></label>
      <label className="scenario-field">Valuation multiple assumption <span>{multiple}×</span><input type="range" min="8" max="40" value={multiple} onChange={e=>setMultiple(Number(e.target.value))}/><small>Compared against a 20× normalized reference multiple.</small></label>
    </section><section className="panel scenario-output"><span className="eyebrow">OUTPUT · NORMALIZED UNITS</span><h2>Illustrative sensitivity range</h2><p className="scenario-formula">Starting units × (1 + growth) × (margin ÷ 15) × (multiple ÷ 20)</p><div className="scenario-results">{scenarios.map((item,index)=><div className={index===1?'scenario-base':''} key={item.label}><span>{item.label}</span><strong>{item.value.toFixed(1)} <small>units</small></strong><p>{item.detail}</p></div>)}</div><div className="response-caveat">This is a simplified arithmetic illustration, not a valuation, investment recommendation, or estimate of future outcomes.</div></section></div>
  </>;
}

function FinancialCalculatorLab({ saveCalculation }) {
  const calculators = {
    CAGR: {
      description: 'Annualized growth between two values over a defined period.',
      fields: [['start', 'Starting value', '100'], ['end', 'Ending value', '150'], ['years', 'Years', '5']],
      formula: 'CAGR = (Ending value ÷ Starting value)^(1 ÷ years) − 1',
      calculate: v => v.start > 0 && v.end >= 0 && v.years > 0 ? ((v.end / v.start) ** (1 / v.years) - 1) * 100 : null,
      format: value => `${value.toFixed(2)}% per year`,
      interpretation: 'An annualized historical rate; it does not imply that growth occurred evenly or will continue.'
    },
    'Compound interest': {
      description: 'Estimate a balance compounded annually using a constant assumed rate.',
      fields: [['principal', 'Starting amount', '100000'], ['rate', 'Annual rate (%)', '8'], ['years', 'Years', '10']],
      formula: 'Future value = Principal × (1 + annual rate)^years',
      calculate: v => v.principal > 0 && v.rate > -100 && v.years >= 0 ? v.principal * (1 + v.rate / 100) ** v.years : null,
      format: value => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      interpretation: 'A mathematical illustration with a constant annual rate; taxes, fees, inflation, and variability are excluded.'
    },
    'EPS growth': {
      description: 'Compare earnings per share across two reporting periods.',
      fields: [['prior', 'Prior EPS', '10'], ['current', 'Current EPS', '12']],
      formula: 'EPS growth = (Current EPS − Prior EPS) ÷ |Prior EPS| × 100',
      calculate: v => v.prior !== 0 ? ((v.current - v.prior) / Math.abs(v.prior)) * 100 : null,
      format: value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
      interpretation: 'A comparison of the two entered values only. Check reporting periods, share count, and accounting basis.'
    },
    'P/E ratio': {
      description: 'Relate a share price to positive earnings per share.',
      fields: [['price', 'Share price (₹)', '100'], ['eps', 'Earnings per share (₹)', '5']],
      formula: 'P/E = Share price ÷ Earnings per share',
      calculate: v => v.price >= 0 && v.eps > 0 ? v.price / v.eps : null,
      format: value => `${value.toFixed(2)}×`,
      interpretation: 'A ratio is not a standalone valuation conclusion; use comparable dated earnings and relevant peer context.'
    },
    'P/B ratio': {
      description: 'Relate a share price to book value per share.',
      fields: [['price', 'Share price (₹)', '100'], ['book', 'Book value per share (₹)', '25']],
      formula: 'P/B = Share price ÷ Book value per share',
      calculate: v => v.price >= 0 && v.book > 0 ? v.price / v.book : null,
      format: value => `${value.toFixed(2)}×`,
      interpretation: 'Book value depends on accounting and industry context; this ratio alone does not indicate whether a security is expensive.'
    },
    'Dividend yield': {
      description: 'Compare annual dividend per share with the entered share price.',
      fields: [['dividend', 'Annual dividend per share (₹)', '4'], ['price', 'Share price (₹)', '100']],
      formula: 'Dividend yield = Annual dividend per share ÷ Share price × 100',
      calculate: v => v.dividend >= 0 && v.price > 0 ? (v.dividend / v.price) * 100 : null,
      format: value => `${value.toFixed(2)}%`,
      interpretation: 'Uses the dividend and price you enter. Dividends can change and are not guaranteed.'
    },
    'Profit margin': {
      description: 'Calculate the margin from entered revenue and costs.',
      fields: [['revenue', 'Revenue (₹)', '100000'], ['costs', 'Costs (₹)', '75000']],
      formula: 'Margin = (Revenue − Costs) ÷ Revenue × 100',
      calculate: v => v.revenue > 0 ? ((v.revenue - v.costs) / v.revenue) * 100 : null,
      format: value => `${value.toFixed(2)}%`,
      interpretation: 'The result depends on which costs you include. State the accounting definition when comparing margins.'
    },
    'Break-even units': {
      description: 'Estimate units required to cover fixed costs at entered unit economics.',
      fields: [['fixed', 'Fixed costs (₹)', '50000'], ['price', 'Selling price per unit (₹)', '500'], ['variable', 'Variable cost per unit (₹)', '300']],
      formula: 'Break-even units = Fixed costs ÷ (Selling price per unit − Variable cost per unit)',
      calculate: v => v.fixed >= 0 && v.price > v.variable ? v.fixed / (v.price - v.variable) : null,
      format: value => `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} units`,
      interpretation: 'Assumes constant prices and costs. Actual break-even depends on product mix, capacity, and changing expenses.'
    },
    'Portfolio return': {
      description: 'Calculate simple return from invested amount and current value.',
      fields: [['invested', 'Invested amount (₹)', '100000'], ['current', 'Current value (₹)', '115000']],
      formula: 'Return = (Current value − Invested amount) ÷ Invested amount × 100',
      calculate: v => v.invested > 0 ? ((v.current - v.invested) / v.invested) * 100 : null,
      format: value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
      interpretation: 'Simple return excludes cash flows, fees, taxes, and timing effects; it is not an annualized return.'
    },
    'EV / EBITDA': {
      description: 'Compare enterprise value with earnings before interest, taxes, depreciation, and amortization.',
      fields: [['enterpriseValue', 'Enterprise value (₹)', '1000000'], ['ebitda', 'EBITDA (₹)', '100000']],
      formula: 'EV / EBITDA = Enterprise value ÷ EBITDA',
      calculate: v => v.enterpriseValue >= 0 && v.ebitda > 0 ? v.enterpriseValue / v.ebitda : null,
      format: value => `${value.toFixed(2)}×`,
      interpretation: 'A valuation multiple, not a standalone conclusion. Confirm consistent definitions, reporting periods, and comparable peers.'
    },
    DCF: {
      description: 'Estimate present value from user-entered free cash flow and explicit growth and discount assumptions.',
      fields: [['fcf', 'Starting annual free cash flow (₹)', '100000'], ['growth', 'Annual FCF growth (%)', '5'], ['discount', 'Discount rate (%)', '10'], ['terminalGrowth', 'Terminal growth (%)', '3'], ['years', 'Projection years (1–30)', '5']],
      formula: 'Enterprise value = Present value of projected cash flows + present value of terminal value',
      calculate: v => {
        if (v.fcf <= 0 || v.growth <= -100 || v.terminalGrowth <= -100 || v.discount <= v.terminalGrowth || v.discount <= 0 || !Number.isInteger(v.years) || v.years < 1 || v.years > 30) return null;
        let presentValue = 0;
        for (let year = 1; year <= v.years; year += 1) presentValue += (v.fcf * (1 + v.growth / 100) ** year) / (1 + v.discount / 100) ** year;
        const terminalCashFlow = v.fcf * (1 + v.growth / 100) ** v.years * (1 + v.terminalGrowth / 100);
        const terminalValue = terminalCashFlow / ((v.discount - v.terminalGrowth) / 100);
        return presentValue + terminalValue / (1 + v.discount / 100) ** v.years;
      },
      format: value => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      interpretation: 'A highly assumption-sensitive illustration. It excludes debt, cash, dilution, changing discount rates, and per-share conversion; it is not a price target.'
    },
    'Maximum drawdown': {
      description: 'Measure the decline from a selected prior peak to a subsequent trough.',
      fields: [['peak', 'Prior peak value', '100'], ['trough', 'Subsequent trough value', '80']],
      formula: 'Drawdown = (Trough value ÷ Peak value − 1) × 100',
      calculate: v => v.peak > 0 && v.trough >= 0 && v.trough <= v.peak ? ((v.trough / v.peak) - 1) * 100 : null,
      format: value => `${value.toFixed(2)}%`,
      interpretation: 'This measures one entered peak-to-trough move. It is historical only and does not describe the maximum drawdown over an unprovided series.'
    },
    'Risk / reward': {
      description: 'Compare the distance from entry to an upside target with the distance to a lower risk level.',
      fields: [['entry', 'Entry reference', '100'], ['risk', 'Risk level', '90'], ['target', 'Target reference', '120']],
      formula: 'Reward-to-risk = (Target − Entry) ÷ (Entry − Risk level)',
      calculate: v => v.entry > 0 && v.risk >= 0 && v.risk < v.entry && v.target > v.entry ? (v.target - v.entry) / (v.entry - v.risk) : null,
      format: value => `${value.toFixed(2)} : 1`,
      interpretation: 'A ratio of user-defined levels only. It does not estimate the probability of reaching either level or account for execution costs.'
    },
    'Annualized volatility': {
      description: 'Annualize the sample standard deviation of entered periodic returns.',
      fields: [['returns', 'Periodic returns (%) · comma-separated', '1, -1, 2, -2, 1', 'text'], ['periods', 'Periods per year', '252']],
      formula: 'Annualized volatility = Sample standard deviation of returns × √(periods per year)',
      calculate: v => {
        const returns = v.returns.split(',').map(value => Number(value.trim()));
        if (returns.length < 2 || returns.some(value => !Number.isFinite(value)) || !Number.isInteger(v.periods) || v.periods < 1) return null;
        const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
        const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
        return Math.sqrt(variance) * Math.sqrt(v.periods);
      },
      format: value => `${value.toFixed(2)}%`,
      interpretation: 'Uses the sample of returns you enter and assumes the chosen number of periods per year. It is not a forecast and may not represent future risk.'
    }
  };
  const [selected, setSelected] = useState('CAGR');
  const [inputs, setInputs] = useState({});
  const [saveNotice, setSaveNotice] = useState('');
  const calculator = calculators[selected];
  const values = Object.fromEntries(calculator.fields.map(([key, , initial, inputType]) => {
    const raw = inputs[`${selected}:${key}`] ?? initial;
    return [key, inputType === 'text' ? raw : Number(raw)];
  }));
  const rawInputsValid = calculator.fields.every(([key, , initial, inputType]) => {
    const raw = inputs[`${selected}:${key}`] ?? initial;
    if (String(raw).trim() === '') return false;
    if (inputType === 'text') {
      const entries = String(raw).split(',').map(value => value.trim());
      return entries.length >= 2 && entries.every(value => value !== '' && Number.isFinite(Number(value)));
    }
    return Number.isFinite(Number(raw));
  });
  const result = rawInputsValid ? calculator.calculate(values) : null;
  const updateInput = (key, value) => { setInputs(current => ({ ...current, [`${selected}:${key}`]: value })); setSaveNotice(''); };
  const saveCurrentCalculation = () => {
    if (result === null || !Number.isFinite(result)) return;
    const formattedResult = calculator.format(result);
    saveCalculation({
      id: `${selected}:${JSON.stringify(values)}`,
      name: selected,
      result: formattedResult,
      formula: calculator.formula,
      inputs: calculator.fields.map(([key, label]) => `${label}: ${values[key]}`).join(' · '),
      savedAt: new Date().toISOString()
    });
    setSaveNotice('Calculation saved to this browser’s Research Workspace.');
  };

  return <>
    <PageHeading eyebrow="ANALYZE · FINANCIAL TOOLS" title="Financial calculator lab" description="Explore transparent calculations using inputs you control. Results are educational, not recommendations." />
    <DataNotice>Calculations run in your browser from the values entered below. No market data is retrieved or assumed.</DataNotice>
    <section className="calculator-layout">
      <div className="panel calculator-controls">
        <label className="calculator-select-label" htmlFor="calculator-select">Choose a calculation</label>
        <select id="calculator-select" value={selected} onChange={event => setSelected(event.target.value)}>
          {Object.keys(calculators).map(name => <option key={name}>{name}</option>)}
        </select>
        <h2>{selected}</h2>
        <p>{calculator.description}</p>
        <div className="calculator-fields">{calculator.fields.map(([key, label, initial, inputType]) => <label key={key}>{label}<input type={inputType || 'number'} inputMode={inputType === 'text' ? 'text' : 'decimal'} step={inputType === 'text' ? undefined : 'any'} aria-label={label} value={inputs[`${selected}:${key}`] ?? initial} onChange={event => updateInput(key, event.target.value)} /></label>)}</div>
      </div>
      <section className="panel calculator-result" aria-live="polite">
        <span className="eyebrow">FORMULA</span>
        <p className="calculator-formula">{calculator.formula}</p>
        <div className="calculator-result-value"><span>Calculated result</span><strong>{result === null || !Number.isFinite(result) ? 'Review inputs' : calculator.format(result)}</strong>{(result === null || !Number.isFinite(result)) && <small className="calculator-validation-note" role="status">Values are incomplete or outside this formula’s valid range.</small>}</div>
        <div className="calculator-interpretation"><strong>How to interpret this</strong><p>{calculator.interpretation}</p></div>
        <span className="status-off">User-entered assumptions · Browser calculation</span>
        <div className="calculator-save-row"><button type="button" className="outline-button" disabled={result === null || !Number.isFinite(result)} onClick={saveCurrentCalculation}>Save to Research Workspace</button>{saveNotice && <span role="status">{saveNotice}</span>}</div>
      </section>
    </section>
  </>;
}

function RiskRadar() {
  const areas = [['Financial risk','Debt, liquidity, and cash-flow resilience','Requires verified statements'],['Market risk','Volatility, drawdown, beta, and correlations','Requires historical price data'],['Business risk','Customer concentration and margin pressure','Requires company disclosures'],['External risk','Regulatory, macro, currency, and commodity exposures','Requires source-linked event data']];
  return <><PageHeading eyebrow="ANALYZE · RISK CONTEXT" title="Risk radar" description="Review risk dimensions separately; no single score can capture a company’s risk."/><DataNotice>Risk metrics are unavailable until verified financial statements, price history, and disclosures are connected.</DataNotice><div className="risk-list">{areas.map(([title,description,status],index)=><section className="panel risk-row" key={title}><span className="risk-index">0{index+1}</span><div><h2>{title}</h2><p>{description}</p></div><span className="status-off">{status}</span></section>)}</div><p className="disclaimer-line">Unavailable means not measured—not low risk.</p></>;
}

function IndustryIntel() {
  return <><PageHeading eyebrow="RESEARCH · INDUSTRY CONTEXT" title="Industry intelligence" description="Trace the relationships between industries, companies, suppliers, and macro factors."/><DataNotice>No industry datasets or verified relationship graph are connected.</DataNotice><section className="panel relationship-panel"><div className="relationship-chain">{['Industry','Companies','Suppliers','Commodities','Macro factors'].map((node,index)=><React.Fragment key={node}><div><span>0{index+1}</span><strong>{node}</strong><small>Source data unavailable</small></div>{index<4&&<b aria-hidden="true">→</b>}</React.Fragment>)}</div><div className="relationship-explainer"><strong>Relationships need provenance</strong><p>When connected, each link will show its source, date, and whether it represents a reported relationship or an analytical association.</p></div></section></>;
}

function Learning() {
  const concepts=[['P/E','Price-to-earnings compares a share price with earnings per share. Interpretation depends on growth, accounting, and industry context.'],['ROE','Return on equity compares net income with average shareholder equity; leverage can materially affect it.'],['RSI','Relative Strength Index is a momentum indicator. High or low readings do not guarantee a reversal.'],['Drawdown','A peak-to-trough decline over a selected period; it describes historical loss, not future risk by itself.']];
  return <><PageHeading eyebrow="LEARN · FINANCIAL FOUNDATIONS" title="Learning mode" description="Plain-language explanations for common market and company metrics."/><div className="learning-grid">{concepts.map(([term,definition])=><article className="panel learning-card" key={term}><span className="eyebrow">CONCEPT</span><h2>{term}</h2><p>{definition}</p><span className="learning-caution">Context matters · Educational only</span></article>)}</div><DataNotice>Definitions are general education, not personalized financial advice.</DataNotice></>;
}

function ResearchWorkspace({ goTo, savedCalculations, removeCalculation }) {
  return <><PageHeading eyebrow="CREATE · YOUR RESEARCH DESK" title="Research workspace" description="Keep calculations and research starting points together in this browser." right={<button className="outline-button" onClick={()=>goTo('Calculator Lab')}>＋ New calculation</button>}/>
    <DataNotice>Saved calculations are stored in this browser only. They are not synced to an account or server.</DataNotice>
    {savedCalculations.length ? <section className="panel table-panel saved-calculations"><div className="table-title"><div><h2>Saved calculations <span className="count-chip">{savedCalculations.length}</span></h2><p>Inputs and outputs are for reference; recalculate when assumptions change.</p></div></div><div className="saved-calculation-list">{savedCalculations.map(item=><article className="saved-calculation-row" key={item.id}><div><span className="eyebrow">{item.name} · BROWSER-LOCAL</span><strong>{item.result}</strong><p>{item.formula}</p><small>{item.inputs}</small></div><div className="saved-calculation-actions"><time dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleDateString()}</time><button type="button" className="watch-mini" aria-label={`Remove saved ${item.name} calculation`} onClick={()=>removeCalculation(item.id)}>×</button></div></article>)}</div></section> : <section className="panel workspace-empty"><span className="workspace-empty-mark">▤</span><h2>Your research desk is ready</h2><p>Save a calculator result to keep its formula, assumptions, and output here. Saved items stay in this browser.</p><div><button className="primary-button" onClick={()=>goTo('Calculator Lab')}>Open Calculator Lab <span>→</span></button><button className="outline-button" onClick={()=>goTo('AI Analyst')}>Ask StockSense</button></div></section>}
  </>;
}

function AlertsPage({ goTo }) {
  return <><PageHeading eyebrow="MANAGE · MONITORING" title="Alert center" description="Price, news, earnings, and risk alerts need a connected data and notification service."/><DataNotice>Alerts are not monitored or delivered in this frontend demo.</DataNotice><section className="panel alert-empty"><span className="workspace-empty-mark">♧</span><h2>No active alerts</h2><p>Create an alert after a verified data source is connected. This demo will not simulate triggers or claim to monitor prices in the background.</p><div><button className="primary-button" onClick={()=>goTo('Settings')}>Review data providers <span>→</span></button><button className="outline-button" onClick={()=>goTo('Watchlist')}>Open watchlist</button></div><div className="alert-types">{['Price threshold','Volume change','Earnings','News','Technical condition','Forecast change'].map(type=><span key={type}>{type}<small>Unavailable in demo</small></span>)}</div></section></>;
}

export default App;
