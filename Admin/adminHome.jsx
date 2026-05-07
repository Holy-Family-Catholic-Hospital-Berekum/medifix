import NavBar from "./navBar";
import { useState } from "react";
import SlideInRight from "../components/slideInRight";
import AlertsContainer from "../components/AlertsContainer";
import { NavLink } from "react-router";
import { nanoid } from "nanoid";
import ReportDetailsContainer from "./reportDetails";
import Pending from "./Pending";

export default function AdminHome() {
  const [sidePopup, setSidePopup] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? "text-red-300" : "text-[#111827] hover:text-blue-200"
    }`;

  const handleClose = () => {
    // give slide-down time to finish before hiding
    setTimeout(() => setFormPopup(false), 300);
  };

  const reports = [
    {
      status: "approved",
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
      status: "approved",
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
      status: "approved",
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
      status: "approved",
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
      status: "approved",
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
      status: "confirmed",
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
      status: "confirmed",
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
      status: "confirmed",
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

  const newReports = reports.filter((report) => report.status === "approved");
  const confirmedWorks = reports.filter(
    (report) => report.status === "confirmed",
  );

  const newReportContainer = newReports.map((report, i) => (
    <div
      className="bg-green-500 border border-gray-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition hover:bg-green-700 rounded-xl w-full max-w-[200px] md:max-w-[300px] p-2 md:p-4 "
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.category.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report.dateApproved}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  const confirmedWorksContainer = confirmedWorks.map((report, i) => (
    <div
      className="bg-green-500 z-60 border border-yellow-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition hover:bg-green-700 rounded-xl w-full max-w-[200px] md:max-w-[300px] p-2 md:p-4 "
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.category.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report.dateConfirmed}
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
      {showConfirmed && (
        <Pending
          showConfirmed={showConfirmed}
          onClose={handleClose}
          confirmedWorksContainer={confirmedWorksContainer}
        />
      )}
      <NavBar />
      <SlideInRight sidePopup={sidePopup} />
      <div className="md:hidden">
        <span
          className="material-symbols-outlined select-none z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400"
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </span>
      </div>

      <div
        className="fixed z-100 bg-green-500 bottom-0 top-auto cursor-pointer left-1/2 -translate-x-1/2 select-none rounded-t-full px-10 py-1 md:hidden"
        onClick={() => setShowConfirmed((prev) => !prev)}
      >
        <span className="text-gray-900">
          {showConfirmed ? "Close" : "Confirmed"}
        </span>
      </div>

      <main className="flex bg-green-300">
        <div className="w-full fixed z-10 border-r border-green-500 max-w-[20%] h-screen bg-red-300  md:flex flex-col pt-24 px-10 gap-10 hidden">
          <NavLink to="/assignedWorks" className={navClass}>
            Assigned
          </NavLink>
          <NavLink to="/completedWorks" end className={navClass}>
            Completed
          </NavLink>
          <NavLink to="/overdueWorks" className={navClass}>
            Overdue
          </NavLink>
        </div>
        <div className="w-full h-screen md:pl-[250px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  overflow-y-auto my-24 flex flex-col items-center">
          <h1 className="text-2xl md:text-4xl text-red-400 font-bold">
            New Reports
          </h1>
          <div className="flex gap-4 md:gap-10 justify-center flex-wrap py-10 md:py-20 px-4">
            {newReportContainer}
          </div>
          <div
            className={`md:flex flex-col items-center py-10 border-t border-green-500 hidden`}
          >
            <h1 className="text-2xl md:mt-20 md:text-4xl text-red-400 font-bold">
              Confirmed Works
            </h1>
            <div className="flex gap-4 md:gap-10 justify-center flex-wrap py-10 md:py-20 px-4">
              {confirmedWorksContainer}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
