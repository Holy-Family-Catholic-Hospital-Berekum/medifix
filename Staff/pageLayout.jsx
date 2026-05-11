import NavBars from "./navBars";
import StaffSlideInRight from "./staffSlideInRight";
import Footer from "../components/footer";

export default function PageLayout({ sidePopup, content, page }) {
  return (
    <>
      <NavBars />
      <StaffSlideInRight sidePopup={sidePopup} slideInBgColor="bg-red-300" />

      {content}

      <Footer page={page} />
    </>
  );
}
