import JoinRoomCard from "@/components/room/JoinRoomCard";

export default function Home() {
  return (
    <div className="container mx-auto py-5">
      <h1 className="text-3xl font-bold">Welcome to CWA!</h1>
      <JoinRoomCard />
    </div>
  );
}
