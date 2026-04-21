export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* TODO: 员工端导航栏 */}
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
