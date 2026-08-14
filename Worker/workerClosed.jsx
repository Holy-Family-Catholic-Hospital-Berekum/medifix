import Home from "../components/Home";

export default function WorkerClosed() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="closed"
      primaryColor="text-red-800"
      title1="Closed Works"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateClosed"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/wc"}
      acceptedRedirect={"/wa"}
      reopenedRedirect={"/wro"}
      closedRedirect={"/wcl"}
      logoBGColor="md:bg-yellow-500"
      homeRedirect="/wh"
      role={"worker"}
    />
  );
}
