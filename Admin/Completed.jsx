import NavBar from "./navBar";
import { useState } from "react";
import SlideInRight from "../components/slideInRight";
import AlertsContainer from "../components/AlertsContainer";
import { NavLink } from "react-router";
import { nanoid } from "nanoid";
import ReportDetailsContainer from "./reportDetails";

export default function CompletedWorks() {
  const [sidePopup, setSidePopup] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? "text-green-800" : "text-[#111827] hover:text-blue-200"
    }`;

  const reports = [
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "plumbing",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "plumbing",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "masonery",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
  ];

  const displayReportDetails = (id) => {
    setDisplayDetails(true);

    const reportToDisplay = reports.filter((report) => report.id === id);

    setCurrentReport(reportToDisplay);
  };

  const completedWorks = reports.filter(
    (report) => report.status === "completed",
  );

  const completedWorksContainer = completedWorks.map((report, i) => (
    <div
      className="bg-green-500 border border-red-300 flex flex-col gap-2 items-center justify-center cursor-pointer transition hover:bg-green-700 rounded-xl w-full max-w-[200px] md:max-w-[300px] p-2 md:p-4 "
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.category.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report.dateCompleted}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  return (
    <>
      <ReportDetailsContainer
        currentReport={currentReport}
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
      />
      <NavBar />
      <SlideInRight sidePopup={sidePopup} />
      <div className="md:hidden">
        <span
          className="material-symbols-outlined select-none z-50 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400"
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </span>
      </div>

      <main className="flex bg-green-300">
        <div className="w-full fixed z-10 border-r border-green-500 max-w-[20%] h-screen bg-red-300  md:flex flex-col pt-24 px-10 gap-10 hidden">
          <NavLink to="/Assigned" className={navClass}>
            Assigned
          </NavLink>
          <NavLink to="/Completed" end className={navClass}>
            Completed
          </NavLink>
          <NavLink to="/Overdue" className={navClass}>
            Overdue
          </NavLink>
        </div>
        <div className="w-full h-screen md:pl-[250px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  overflow-y-auto my-24 flex flex-col items-center">
          <h1 className="text-2xl md:text-4xl text-red-400 font-bold">
            Completed Works
          </h1>
          <div className="flex gap-4 md:gap-10 justify-center flex-wrap py-10 md:py-20 px-4">
            {completedWorksContainer}
          </div>
        </div>
      </main>
    </>
  );
}
