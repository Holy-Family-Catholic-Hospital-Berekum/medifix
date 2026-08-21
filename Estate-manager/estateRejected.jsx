import Home from "../components/Home";

export default function Rejected() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="rejected"
      primaryColor="text-yellow-300"
      title1="Rejected Works"
      secColor={"bg-blue-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-blue-600"}
      reportDate1="dateSent"
      titleBorderColor={"border-yellow-300"}
      navBarColor="bg-yellow-300"
      slideInBgColor="bg-yellow-300"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/ec"}
      assignedRedirect={"/ea"}
      rejectedRedirect={"/er"}
      acceptedRedirect={"/eip"}
      reopenedRedirect={"/ero"}
      logoBGColor="md:bg-blue-500"
      homeRedirect="/eh"
      dashboardRedirect={"/ed"}
      closedRedirect={"/ecl"}
      droppedRedirect={"/edr"}
      role={"estate"}
    />
  );
}
