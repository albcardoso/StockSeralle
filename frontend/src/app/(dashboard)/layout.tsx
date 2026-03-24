import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { StockProvider } from "@/contexts/StockContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StockProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Header />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar />
          <main
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "26px 28px",
              background: "var(--bg)",
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </StockProvider>
  );
}
