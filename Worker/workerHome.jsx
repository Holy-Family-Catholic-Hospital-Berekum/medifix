import Home from "../components/Home";

export default function WorkerHome() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="assigned"
      primaryColor="text-red-800"
      title1="Assigned to You"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateAssigned"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/wc"}
      reopenedRedirect={"/wro"}
      acceptedRedirect={"/wa"}
      logoBGColor="md:bg-yellow-500"
      closedRedirect={"/wcl"}
      homeRedirect="/wh"
      role={"worker"}
    />
  );
}
