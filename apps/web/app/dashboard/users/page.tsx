"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  MoreVertical,
  UserPlus,
  Shield,
  Trash2,
  Edit3,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  X,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "Inspector" | "Analyst" | "Administrator" | "Investigator";
  status: "Active" | "Inactive" | "Under Investigation";
  department: string;
  lastActive: string;
  avatar: string;
}

const INITIAL_USERS: User[] = [
  { id: "USR-001", name: "Rohit Sharma", email: "rohit.sharma92@gmail.com", role: "Investigator", status: "Under Investigation", department: "Delhi Cyber Cell", lastActive: "05 Sep 2026, 10:24 AM", avatar: "https://i.pravatar.cc/150?img=33" },
  { id: "USR-002", name: "Amit Verma", email: "amit.verma@cyber.gov.in", role: "Analyst", status: "Active", department: "Financial Fraud Unit", lastActive: "05 Sep 2026, 09:45 AM", avatar: "https://i.pravatar.cc/150?img=12" },
  { id: "USR-003", name: "Neha Singh", email: "neha.singh@cyber.gov.in", role: "Inspector", status: "Active", department: "Delhi Cyber Cell", lastActive: "05 Sep 2026, 08:30 AM", avatar: "https://i.pravatar.cc/150?img=5" },
  { id: "USR-004", name: "Rajesh Kumar", email: "r.kumar@mha.gov.in", role: "Administrator", status: "Active", department: "MHA Cyber Command", lastActive: "04 Sep 2026, 06:12 PM", avatar: "https://i.pravatar.cc/150?img=68" },
  { id: "USR-005", name: "Priya Sharma", email: "priya.s@cyber.gov.in", role: "Analyst", status: "Inactive", department: "Intelligence Bureau", lastActive: "01 Sep 2026, 02:15 PM", avatar: "https://i.pravatar.cc/150?img=9" },
  { id: "USR-006", name: "Vikram Malhotra", email: "v.malhotra@mha.gov.in", role: "Inspector", status: "Active", department: "Special Cell", lastActive: "05 Sep 2026, 11:05 AM", avatar: "https://i.pravatar.cc/150?img=53" },
];

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "Investigator" as User["role"],
    department: "",
    status: "Active" as User["status"],
  });

  // Search Filter Handler
  const filteredUsers = useMemo(() => {
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  // Pagination Calculations
  const totalItems = filteredUsers.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredUsers, startIndex, pageSize]);

  // Delete Action
  const handleDeleteUser = (id: string) => {
    setUsers((prev) => prev.filter((user) => user.id !== id));
  };

  // Provision User Form Submit
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    const newUser: User = {
      id: `USR-00${users.length + 1}`,
      name: formData.name,
      email: formData.email,
      role: formData.role,
      department: formData.department || "General Unit",
      status: formData.status,
      lastActive: "Just now",
      avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
    };

    setUsers([newUser, ...users]);
    setIsModalOpen(false);
    setFormData({ name: "", email: "", role: "Investigator", department: "", status: "Active" });
  };

  const getStatusBadge = (status: User["status"]) => {
    switch (status) {
      case "Active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        );
      case "Inactive":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/30">
            <XCircle className="w-3 h-3" /> Inactive
          </span>
        );
      case "Under Investigation":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <Clock className="w-3 h-3" /> Under Investigation
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20">
                ATLAS Core
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">User Management</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Control security roles, unit access, and system clearance.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 bg-[#0052cc] hover:bg-blue-600 text-white font-medium px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-blue-600/20 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Provision User</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0d1322] p-4 rounded-xl border border-slate-800/80">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or unit..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Filter className="w-4 h-4" />
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#070b14] border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
        </div>

        {/* User Table */}
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#080d19] text-slate-400 uppercase text-[11px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th scope="col" className="px-6 py-4">User Details</th>
                  <th scope="col" className="px-6 py-4">Role</th>
                  <th scope="col" className="px-6 py-4">Department / Unit</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4">Last Activity</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {paginatedUsers.length > 0 ? (
                  paginatedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-700/80"
                          />
                          <div>
                            <div className="font-medium text-slate-100 flex items-center gap-2">
                              {user.name}
                              <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.2 rounded font-mono">
                                {user.id}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 font-mono">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Shield className="w-3.5 h-3.5 text-blue-400" />
                          <span>{user.role}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300">{user.department}</td>
                      <td className="px-6 py-4">{getStatusBadge(user.status)}</td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">{user.lastActive}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-blue-400 rounded transition-colors" title="Edit">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No matching personnel records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Active Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-800 bg-[#080d19]/80">
            <div className="text-xs text-slate-400 font-mono">
              Showing <span className="text-slate-200 font-semibold">{totalItems === 0 ? 0 : startIndex + 1}</span> -{" "}
              <span className="text-slate-200 font-semibold">{endIndex}</span> of{" "}
              <span className="text-slate-200 font-semibold">{totalItems}</span> entries
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-slate-800 bg-[#0d1322] text-slate-400 hover:text-slate-100 disabled:opacity-30 transition-all"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-slate-800 bg-[#0d1322] text-slate-400 hover:text-slate-100 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1 mx-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                      currentPage === page
                        ? "bg-[#0052cc] text-white border border-blue-500 shadow-md shadow-blue-600/30"
                        : "bg-[#0d1322] border border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1.5 rounded border border-slate-800 bg-[#0d1322] text-slate-400 hover:text-slate-100 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1.5 rounded border border-slate-800 bg-[#0d1322] text-slate-400 hover:text-slate-100 disabled:opacity-30 transition-all"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Provision User Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-[#0d1322] border border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#080d19]">
                <h2 className="text-lg font-bold text-white">Provision New User</h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikram Malhotra"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="v.malhotra@mha.gov.in"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as User["role"] })}
                      className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
                    >
                      <option value="Investigator">Investigator</option>
                      <option value="Inspector">Inspector</option>
                      <option value="Analyst">Analyst</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as User["status"] })}
                      className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Under Investigation">Under Investigation</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Department / Unit</label>
                  <input
                    type="text"
                    placeholder="e.g. Special Cell"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#0052cc] hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors shadow-lg shadow-blue-600/20"
                  >
                    Confirm Provision
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}