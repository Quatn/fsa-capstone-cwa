import UserProfile from "./UserProfile";

export default function Header() {
  return (
    <div className="flex items-center justify-between py-4 px-8 sm:px-6">
      <div className="flex items-center">
        {/*<img src="/logo.png" alt="Logo" className="h-8 w-8" />*/}
        <span className="ml-3 text-xl font-bold tracking-tight text-gray-900">
          CWA
        </span>
        <div className="grow" />

        <UserProfile />

      </div>
    </div>
  )
}

