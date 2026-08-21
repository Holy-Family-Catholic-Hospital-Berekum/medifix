import Home from "../components/Home";

export default function EstateDropped() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="dropped"
      primaryColor="text-red-800"
      title1="Dropped Works"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateDropped"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/ec"}
      assignedRedirect={"/ea"}
      rejectedRedirect={"/er"}
      acceptedRedirect={"/eip"}
      reopenedRedirect={"/ero"}
      droppedRedirect={"/edr"}
      logoBGColor="md:bg-yellow-500"
      homeRedirect="/eh"
      closedRedirect={"/ecl"}
      dashboardRedirect={"/ed"}
      role={"estate"}
    />
  );
}
