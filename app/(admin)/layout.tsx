export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* TODO: 主管端侧边栏 + 导航 */}
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
