import EventEditor from "@/components/admin/editor/EventEditor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <EventEditor id={(await params).id} />;
}
