import { markOverdueReports } from "../src/utils";
import NavBar from "./navBar";
import { useState, useEffect } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import { nanoid } from "nanoid";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
import {
  collection,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "../src/firebase";

function useCountdown(dateDue) {
  const getTimeLeft = () => {
    // Firestore Timestamp has toDate(), plain Date is instanceof Date
    let due = null;
    if (dateDue?.toDate) {
      due = dateDue.toDate();
    } else if (dateDue instanceof Date) {
      due = dateDue;
    } else if (dateDue) {
      due = new Date(dateDue);
    }

    if (!due || isNaN(due.getTime())) return null;

    const diff = due - Date.now();
    if (diff <= 0) return { overdue: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, mins, secs, overdue: false };
  };

  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    setTimeLeft(getTimeLeft());
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, [dateDue]);

  return timeLeft;
}

function Countdown({ dateDue, status, overdueFlag }) {
  const t = useCountdown(dateDue);

  if (status === "completed") return null;
  if (!t) return null;

  // If locally computed as overdue but Firestore flag not set yet,
  // show a fallback "Overdue" label so nothing disappears
  if (t.overdue) {
    if (overdueFlag) return null; // card already shows the ⚠ OVERDUE block
    return (
      <span className="text-xs font-bold text-red-300 bg-black/40 px-2 py-0.5 rounded">
        ⚠ OVERDUE
      </span>
    );
  }

  return (
    <span className="text-xs text-white bg-black/30 px-1.5 py-0.5 rounded">
      {t.days > 0 && `${t.days}d `}
      {t.hours}h {t.mins}m {t.secs}s left
    </span>
  );
}

function timeAgo(date) {
  if (!date) return null;
  let d = null;
  if (date?.toDate) {
    d = date.toDate();
  } else if (date instanceof Date) {
    d = date;
  } else {
    d = new Date(date);
  }
  if (!d || isNaN(d.getTime())) return null;

  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

function Preloader() {
  return (
    <div className="flex flex-col justify-center items-center w-full py-20 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-400 animate-spin" />
      </div>
      <p className="text-sm text-gray-400 animate-pulse">Loading reports...</p>
    </div>
  );
}

export default function Home({
  bgColor,
  primaryColor,
  secColor,
  completedRedirect,
  assignedRedirect,
  title1,
  title2,
  titleBgColor,
  reportDate1,
  reportDate2,
  firstReportsStatus,
  secondReportsStatus,
  reportCardHoverColor,
  titleBorderColor,
  navBarColor,
  slideInBgColor,
  reportDetailsBgColor,
  reportsHiddenOnMobileTitle,
  specificReportsPage,
  logoBGColor,
  homeRedirect,
  dashboardRedirect,
}) {
  const [sidePopup, setSidePopup] = useState(false);
  const [showReportsHiddenOnMobile, SetShowReportsHiddenOnMobile] =
    useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [reports, setReports] = useState([]);

  const [currentReportId, setCurrentReportId] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    markOverdueReports(user);
  }, []);

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? `${primaryColor}` : "text-[#111827] hover:text-blue-200"
    }`;

  const handleClose = () => {
    setTimeout(() => SetShowReportsHiddenOnMobile(false), 300);
  };

  useEffect(() => {
    let reportsQuery;

    if (user?.role === "worker") {
      reportsQuery = query(
        collection(db, "reports"),
        where("assignedTo", "==", user.ID),
      );
    } else {
      reportsQuery = query(collection(db, "reports"));
    }

    const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
      const reportsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReports(reportsData);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let reportsQuery;

    if (user?.role === "worker") {
      reportsQuery = query(
        collection(db, "reports"),
        where("assignedTo", "==", user.ID),
      );
    } else {
      reportsQuery = query(collection(db, "reports"));
    }

    const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
      const reportsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReports(reportsData);
      setReportsLoading(false); // mark ready after first snapshot
    });

    return () => unsubscribe();
  }, []);

  const getAllAlerts = () => {
    const allAlerts = [];
    reports.forEach((report) => {
      if (!report.alerts || !Array.isArray(report.alerts)) return;
      report.alerts.forEach((alert) => {
        if (alert.sentTo === user?.role || alert.sentTo === user?.ID) {
          allAlerts.push({
            ...alert,
            reportId: report.id,
            reportCategory: report.category,
          });
        }
      });
    });
    return allAlerts.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const alerts = getAllAlerts();

  const firstReports = reports
    .filter((report) =>
      Array.isArray(firstReportsStatus)
        ? firstReportsStatus.includes(report.status)
        : report.status === firstReportsStatus,
    )
    .sort((a, b) => {
      const aTime = a.dateSent?.toDate?.() ?? new Date(0);
      const bTime = b.dateSent?.toDate?.() ?? new Date(0);
      return bTime - aTime;
    });

  const secondReports = reports
    .filter((report) =>
      Array.isArray(secondReportsStatus)
        ? secondReportsStatus.includes(report.status)
        : report.status === secondReportsStatus,
    )
    .sort((a, b) => {
      const aTime = a.dateSent?.toDate?.() ?? new Date(0);
      const bTime = b.dateSent?.toDate?.() ?? new Date(0);
      return bTime - aTime;
    });

  const displayReportDetails = (id) => {
    setCurrentReportId(id);
    setDisplayDetails(true);
  };

  const currentReport = reports.filter(
    (report) => report.id === currentReportId,
  );

  const hasFeedback = (report) =>
    report.feedback && !report.feedbackViewedBy?.includes(user?.ID);

  const completedWithFeedback = reports.filter(
    (r) => r.status === "completed" && hasFeedback(r),
  ).length;

  // cardColors — remove overdue status check, it's now just a flag
  const cardColors = (status, priority) => {
    if (status !== "completed" && priority === "emergency")
      return "bg-red-600 hover:bg-red-700";
    if (status !== "completed" && priority === "urgent")
      return "bg-red-500 hover:bg-red-700";
    return "bg-green-500 hover:bg-green-600";
  };

  // firstReportsCard — update overdue label and card call:
  const firstReportsCard = firstReports.map((report) => (
    <div
      className={`relative ${cardColors(report.status, report.priorityLevel)} select-none border border-gray-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4`}
      key={report.id}
      onClick={() => displayReportDetails(report.id)}
    >
      {hasFeedback(report) && (
        <span className="absolute -top-2 -right-2 bg-yellow-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full shadow animate-bounce">
          💬 Feedback
        </span>
      )}
      <h1>{report.priorityLevel.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded text-xs">
          {report[reportDate1]?.toDate?.().toLocaleDateString()}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded text-xs">
          {report.status}
        </span>
      </div>
      {report.overdue && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-red-300 bg-black/40 px-2 py-0.5 rounded">
            ⚠ OVERDUE
          </span>
          {report.dateDue && report.status !== "completed" && (
            <span className="text-xs text-red-200 bg-black/30 px-1.5 py-0.5 rounded">
              due {timeAgo(report.dateDue)}
            </span>
          )}
        </div>
      )}
      {!report.overdue && (
        <Countdown
          dateDue={report.dateDue}
          status={report.status}
          overdueFlag={report.overdue}
        />
      )}
    </div>
  ));

  const secondReportsCard = secondReports.map((report) => (
    <div
      className={`${cardColors(report.status, report.priorityLevel)} z-60 border select-none border-yellow-800 md:flex flex-col gap-2 items-center justify-center cursor-pointer transition rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4 ${showReportsHiddenOnMobile ? "flex" : "hidden"}`}
      key={report.id}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.priorityLevel.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded text-xs">
          {report[reportDate2]?.toDate?.().toLocaleDateString()}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded text-xs">
          {report.status}
        </span>
      </div>
      {report.overdue && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-red-300 bg-black/40 px-2 py-0.5 rounded">
            ⚠ OVERDUE
          </span>
          {report.dateDue && (
            <span className="text-xs text-red-200 bg-black/30 px-1.5 py-0.5 rounded">
              due {timeAgo(report.dateDue)}
            </span>
          )}
        </div>
      )}
      {!report.overdue && (
        <Countdown
          dateDue={report.dateDue}
          status={report.status}
          overdueFlag={report.overdue}
        />
      )}
    </div>
  ));

  return (
    <>
      <ReportDetailsContainer
        currentReport={currentReport}
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
        reportDetailsBgColor={reportDetailsBgColor}
      />

      {showReportsHiddenOnMobile && (
        <ReportsHiddenOnMobile
          showReportsHiddenOnMobile={showReportsHiddenOnMobile}
          onClose={handleClose}
          reportsHiddenOnMobile={secondReportsCard}
          reportsHiddenOnMobileTitle={reportsHiddenOnMobileTitle}
          secondReports={secondReports}
        />
      )}

      <NavBar
        navBarColor={navBarColor}
        logoBGColor={logoBGColor}
        homeRedirect={homeRedirect}
        dashboardRedirect={dashboardRedirect}
      />
      <SlideInRight
        sidePopup={sidePopup}
        slideInBgColor={slideInBgColor}
        assignedRedirect={assignedRedirect}
        completedRedirect={completedRedirect}
        completedWithFeedback={completedWithFeedback}
        dashboardRedirect={dashboardRedirect}
      />

      <div className="md:hidden">
        <span
          className="material-symbols-outlined select-none z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400"
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </span>
      </div>

      {!specificReportsPage && (
        <div
          className="fixed z-100 bg-red-400 bottom-0 top-auto cursor-pointer left-1/2 -translate-x-1/2 select-none rounded-t-full px-10 py-1 md:hidden"
          onClick={() => SetShowReportsHiddenOnMobile((prev) => !prev)}
        >
          <span className="text-gray-900">
            {showReportsHiddenOnMobile
              ? "Close"
              : `${reportsHiddenOnMobileTitle && reportsHiddenOnMobileTitle.split(" ")[0]}`}
          </span>
        </div>
      )}

      <main className={`flex ${bgColor}`}>
        <div
          className={`w-full fixed inset-y-0 z-10 max-w-[20%] h-screen ${secColor} md:flex flex-col pt-24 px-10 gap-10 hidden`}
        >
          {assignedRedirect && (
            <NavLink to={`${assignedRedirect}`} className={navClass}>
              Assigned
            </NavLink>
          )}
          <NavLink to={`${completedRedirect}`} end className={navClass}>
            Completed
            {completedWithFeedback > 0 && (
              <span className="ml-2 bg-yellow-400 text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {completedWithFeedback}
              </span>
            )}
          </NavLink>
        </div>

        <div className="w-full h-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto py-24 flex flex-col items-center z-0">
          <h1
            className={`text-xl border-y ${titleBorderColor} md:text-2xl ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
          >
            {title1}
          </h1>

          {reportsLoading ? (
            <Preloader />
          ) : firstReports.length > 0 ? (
            <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
              {firstReportsCard}
            </div>
          ) : (
            <p className="my-20">Nothing to display here...yet</p>
          )}

          {!specificReportsPage && (
            <h1
              className={`text-xl hidden md:block md:text-2xl border-y ${titleBorderColor} ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
            >
              {title2}
            </h1>
          )}

          {!specificReportsPage &&
            (reportsLoading ? (
              <div className="hidden md:flex">
                <Preloader />
              </div>
            ) : secondReports.length > 0 ? (
              <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
                {secondReportsCard}
              </div>
            ) : (
              <p className="hidden md:block my-20">
                Nothing to display here...yet
              </p>
            ))}
        </div>
      </main>
    </>
  );
}
