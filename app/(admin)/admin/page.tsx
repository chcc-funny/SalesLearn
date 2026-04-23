"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  const { data: session } = useSession();

  const menuItems = [
    { title: "知识库管理", desc: "上传、切分、发布知识点", href: "/admin/knowledge" },
    { title: "审核管理", desc: "审核知识点和题目", href: "/admin/review" },
    { title: "团队看板", desc: "查看团队学习数据", href: "/admin/team" },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              管理后台
            </h1>
            <p className="text-sm text-text-secondary">
              欢迎回来，{session?.user?.name ?? "主管"}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            退出登录
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {menuItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl bg-surface p-6 shadow-card transition-shadow hover:shadow-lg"
            >
              <h3 className="text-lg font-medium text-text-primary">
                {item.title}
              </h3>
              <p className="mt-1 text-sm text-text-tertiary">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
