import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "QuarkBox — Cloud Sandbox Platform",
  description: "Secure, elastic cloud sandboxes for AI agents and developers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        <div className="flex h-screen">
          {/* Sidebar */}
          <aside className="w-64 border-r flex flex-col"
            style={{ borderColor: 'var(--qb-border)', background: 'var(--qb-surface)' }}>
            {/* Logo */}
            <div className="p-5 border-b" style={{ borderColor: 'var(--qb-border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: 'linear-gradient(135deg, var(--qb-accent), #c084fc)', color: 'white' }}>
                  ⚛
                </div>
                <div>
                  <h1 className="text-base font-semibold" style={{ color: 'var(--qb-text)' }}>QuarkBox</h1>
                  <p className="text-[10px]" style={{ color: 'var(--qb-text-muted)' }}>v0.1.0</p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-3 space-y-1">
              <NavItem icon="⬡" label="Sandboxes" active />
              <NavItem icon="📊" label="Monitoring" />
              <NavItem icon="🔑" label="API Keys" />
              <NavItem icon="📸" label="Snapshots" />
              <NavItem icon="⚙️" label="Settings" />
            </nav>

            {/* Footer */}
            <div className="p-4 border-t" style={{ borderColor: 'var(--qb-border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ background: 'var(--qb-accent-glow)', color: 'var(--qb-accent)' }}>
                  D
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--qb-text)' }}>Dev User</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--qb-text-muted)' }}>dev@quarkbox.local</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-auto" style={{ background: 'var(--qb-bg)' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavItem({ icon, label, active = false }: { icon: string; label: string; active?: boolean }) {
  return (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150"
      style={{
        background: active ? 'var(--qb-accent-glow)' : 'transparent',
        color: active ? 'var(--qb-accent)' : 'var(--qb-text-muted)',
        fontWeight: active ? 500 : 400,
      }}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}
