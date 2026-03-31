import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import { StockProvider } from "@/contexts/StockContext";
import { SettingsProvider } from "@/contexts/SettingsContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SettingsProvider>
      <StockProvider>
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <Header />
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            <Sidebar />
            <main className="app-main">
              {children}
            </main>
          </div>
          <BottomNav />
        </div>
      </StockProvider>
    </SettingsProvider>
  );
}
