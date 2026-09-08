import CreateRoomCard from "@/components/room/CreateRoomCard";
import NavigateToRoomCard from "@/components/room/NavigateToRoomCard";

export default function page() {
  return (
    <div className="container mx-auto py-5">
      <CreateRoomCard />
      <NavigateToRoomCard />
    </div>
  )
}

