import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchShareSubject } from "./subject";

type PageProps = {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

async function origin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "";
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { kind, id } = await params;
  const query = new URLSearchParams(Object.entries(await searchParams).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const subject = await fetchShareSubject(kind, id, query);
  if (!subject) return { title: "K-Town Defense" };

  const imageUrl = `${await origin()}/share/${kind}/${id}/image${query.size > 0 ? `?${query.toString()}` : ""}`;
  return {
    title: subject.title,
    description: subject.description,
    openGraph: { title: subject.title, description: subject.description, type: "website", images: [{ url: imageUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: subject.title, description: subject.description, images: [imageUrl] },
  };
}

export default async function SharePage({ params, searchParams }: PageProps) {
  const { kind, id } = await params;
  const query = new URLSearchParams(Object.entries(await searchParams).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const subject = await fetchShareSubject(kind, id, query);
  if (!subject) notFound();

  return (
    <main className="membership-gate">
      <div className="membership-card">
        <span className="eyebrow">K-TOWN DEFENSE</span>
        <h1>{subject.title}</h1>
        <p>{subject.description}</p>
        <Link className="primary-button" href="/">앱에서 열기</Link>
      </div>
    </main>
  );
}
