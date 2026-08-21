import Home from "../components/Home";

export default function EstateClosed() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="closed"
      primaryColor="text-yellow-300"
      title1="Closed Works"
      secColor={"bg-blue-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-blue-600"}
      reportDate1="dateClosed"
      titleBorderColor={"border-yellow-300"}
      navBarColor="bg-yellow-300"
      slideInBgColor="bg-yellow-300"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      reopenedRedirect={"/ero"}
      completedRedirect={"/ec"}
      assignedRedirect={"/ea"}
      rejectedRedirect={"/er"}
      acceptedRedirect={"/eip"}
      closedRedirect={"/ecl"}
      homeRedirect="/eh"
      droppedRedirect={"/edr"}
      dashboardRedirect={"/ed"}
      role={"estate"}
    />
  );
}
