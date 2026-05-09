import Home from "../components/Home";

export default function Completed() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="completed"
      primaryColor="text-yellow-300"
      title1="Completed Works"
      secColor={"bg-blue-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-blue-600"}
      reportDate1="dateCompleted"
      titleBorderColor={"border-yellow-300"}
      navBarColor="bg-yellow-300"
      slideInBgColor="bg-yellow-300"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      overdueRedirect={"/estateOverdue"}
      completedRedirect={"/estateCompleted"}
      assignedRedirect={"/estateAssigned"}
      logoBGColor="md:bg-blue-500"
      homeRedirect="/estateHome"
    />
  );
}
