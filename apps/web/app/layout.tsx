import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { SiteChrome } from "./_components/site-chrome";
import { SiteFooter } from "./_components/site-footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeScript = `
(function(){
  var root=document.documentElement, key='vinext-theme';
  function sysLight(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches; }
  function stored(){ try{ var s=localStorage.getItem(key); return (s==='dark'||s==='light')?s:null; }catch(e){ return null; } }
  function current(){ var s=stored(); return s || (sysLight()?'light':'dark'); }
  function apply(t){ root.setAttribute('data-theme',t); var m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', t==='light'?'#faf8f3':'#0a0b0d'); }
  apply(current());
  if(window.matchMedia){ var mq=window.matchMedia('(prefers-color-scheme: light)'); var f=function(e){ if(stored())return; apply(e.matches?'light':'dark'); }; if(mq.addEventListener)mq.addEventListener('change',f); else if(mq.addListener)mq.addListener(f); }
  var fadeT;
  window.__vinextTheme={ get:function(){ return root.getAttribute('data-theme')||'dark'; }, toggle:function(){ var now=(this.get()==='light')?'dark':'light'; try{localStorage.setItem(key,now);}catch(e){} root.classList.add('theme-fade'); clearTimeout(fadeT); fadeT=setTimeout(function(){ root.classList.remove('theme-fade'); },280); apply(now); return now; } };
})();
`;

export const metadata: Metadata = {
  title: "vinext",
  description:
    "Take any Next.js app and deploy it anywhere with one command. App Router, Pages Router, RSC, ISR — all on Vite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#0a0b0d" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--bg)] text-[var(--ink)]">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteChrome />
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
