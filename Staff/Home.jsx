import electricity from "../images/electricity.jpg";
import carpentry from "../images/carpentry.jpg";
import plumbing from "../images/plumbing.jpg";

export default function Home() {
  const services = [
    {
      name: "Electricity",
      provisions: ["Repairs", "Suplies"],
      image: electricity,
    },
    {
      name: "Plumbing",
      provisions: ["Repairs", "Suplies"],
      image: plumbing,
    },
    {
      name: "Carpentry",
      provisions: ["Repairs", "Suplies"],
      image: carpentry,
    },
  ];

  const serviceCard = services.map((service) => (
    <div className="flex flex-col items-center justify-center cursor-pointer rounded-xl border p-4 max-w-[120px] md:max-w-[300px]  w-full border-red-300 shadow">
      <h1 className="text-xl mb-2 text-[[#111827]">{service.name}</h1>
      <div className="flex justify-center items-center gap-2">
        <span class="material-symbols-outlined">
          <span class="material-symbols-outlined">chevron_right</span>
        </span>
        <span>{service.provisions[0]}</span>
      </div>
      <div className="flex justify-center items-center gap-2 mb-2">
        <span className="material-symbols-outlined">
          <span className="material-symbols-outlined">chevron_right</span>
        </span>
        <span className="text-lg">{service.provisions[1]}</span>
      </div>

      <img
        src={service.image}
        alt=""
        className="hidden rounded md:flex max-h-40 w-full"
      />
    </div>
  ));

  return (
    <>
      <nav className="shadow flex justify-between gap-20 w-full fixed bottom-auto top-0 px-10 py-5 md:top-auto md:bottom-0">
        <button className="text-[#111827]  cursor-pointer hover:text-red-300 transition">
          SignUp
        </button>
        <button className="text-red-300 text-lg bg-[#2563EB] px-4 py-1 rounded-full cursor-pointer hover:text-white transition">
          Report
        </button>
      </nav>

      <nav className="bg-[#2563EB] flex justify-center gap-20 w-full fixed bottom-0 top-auto px-10 py-5 md:top-0 md:bottom-auto">
        <button className="text-[#111827] cursor-pointer hover:text-white transition">
          Home
        </button>
        <button className="text-[#111827] cursor-pointer hover:text-white transition">
          Reports
        </button>
      </nav>
      <main className="py-30">
        <div className="flex justify-center px-10 gap-5  flex-wrap mx-auto">
          {serviceCard}
        </div>
      </main>
    </>
  );
}
