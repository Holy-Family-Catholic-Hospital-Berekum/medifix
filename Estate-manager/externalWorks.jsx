import Home from "../components/Home";

export default function EstateExternalWorks() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus={["accepted", "reopened"]}
      primaryColor="text-yellow-300"
      title1="External Jobs"
      secColor={"bg-blue-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-blue-600"}
      reportDate1="dateAccepted"
      titleBorderColor={"border-yellow-300"}
      navBarColor="bg-yellow-300"
      slideInBgColor="bg-yellow-300"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/ec"}
      assignedRedirect={"/ea"}
      rejectedRedirect={"/er"}
      reopenedRedirect={"/ero"}
      acceptedRedirect={"/eip"}
      logoBGColor="md:bg-blue-500"
      closedRedirect={"/ecl"}
      homeRedirect="/eh"
      externalRedirect={"/eext"}
      firstReportsServiceType={"external"}
      droppedRedirect={"/edr"}
      dashboardRedirect={"/ed"}
      role={"estate"}
    />
  );
}
