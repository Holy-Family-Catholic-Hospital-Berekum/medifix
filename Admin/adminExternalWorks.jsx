import Home from "../components/Home";

export default function AdminExternalWorks() {
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
      completedRedirect={"/ac"}
      acceptedRedirect={"/aip"}
      logoBGColor="md:bg-blue-500"
      closedRedirect={"/acl"}
      reopenedRedirect={"/aro"}
      homeRedirect="/ah"
      externalRedirect={"/aext"}
      firstReportsServiceType={"external"}
      dashboardRedirect={"/ad"}
      role={"admin"}
    />
  );
}
