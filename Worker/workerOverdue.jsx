import Home from "../components/Home";

export default function WorkerOverdue() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="overdue"
      primaryColor="text-red-800"
      title1="Overdue Works"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateDue"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      overdueRedirect={"/workerOverdue"}
      completedRedirect={"/workerCompleted"}
      logoBGColor="md:bg-yellow-500"
      homeRedirect="/workerHome"
    />
  );
}
