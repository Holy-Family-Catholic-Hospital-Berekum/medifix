import Home from "../components/Home";

export default function EstateInProgress() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="accepted"
      primaryColor="text-red-800"
      title1="Works in Progress"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateAccepted"
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
      logoBGColor="md:bg-yellow-500"
      homeRedirect="/eh"
      closedRedirect={"/ecl"}
      droppedRedirect={"/edr"}
      dashboardRedirect={"/ed"}
      role={"estate"}
    />
  );
}
