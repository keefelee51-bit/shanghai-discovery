// Home is the page — it owns the layout shell (Header) and renders Feed below it.
// Keeping Header here (not inside Feed) means Feed is a reusable component
// that can be embedded anywhere without dragging the header along with it.
import { Header } from "../components/shanghai/Header"
import { Feed } from "../components/shanghai/Feed"

export default function Home() {
  return (
    <>
      <Header />
      <Feed />
    </>
  )
}
