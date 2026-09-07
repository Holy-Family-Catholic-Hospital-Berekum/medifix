import Home from "../components/Home";

export default function WorkerReOpened() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="reopened"
      firstReportsServiceType="internal" 
      primaryColor="text-red-800"
      title1="Reopened Jobs"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateReopened"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/wc"}
      acceptedRedirect={"/wa"}
      logoBGColor="md:bg-yellow-500"
      reopenedRedirect={"/wro"}
      homeRedirect="/wh"
      closedRedirect={"/wcl"}
      role={"worker"}
    />
  );
}
