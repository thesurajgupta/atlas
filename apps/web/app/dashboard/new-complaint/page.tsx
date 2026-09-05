"use client";

import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  LayoutDashboard,
  FilePlus,
  FolderKanban,
  Search,
  ArrowRightLeft,
  Share2,
  MapPin,
  Compass,
  Bell,
  FileBarChart,
  Users,
  Settings,
  FileText,
  Upload,
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  Hash,
  Loader2,
} from "lucide-react";

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  complaintType: string;
  incidentDate: string;
  incidentTime: string;
  transactionId: string;
  description: string;
  file: File | null;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  complaintType?: string;
  incidentDate?: string;
  description?: string;
  file?: string;
}



export default function AtlasNewComplaintPage() {
  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    email: "",
    phone: "",
    complaintType: "",
    incidentDate: "",
    incidentTime: "",
    transactionId: "",
    description: "",
    file: null,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required.";
    if (!formData.email.trim()) {
      newErrors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required.";
    } else if (!/^\+?[0-9\s\-]{8,15}$/.test(formData.phone)) {
      newErrors.phone = "Please enter a valid phone number.";
    }

    if (!formData.complaintType) newErrors.complaintType = "Select a complaint category.";
    if (!formData.incidentDate) newErrors.incidentDate = "Incident date is required.";

    if (!formData.description.trim()) {
      newErrors.description = "Detailed description is required.";
    } else if (formData.description.trim().length < 20) {
      newErrors.description = "Must be at least 20 characters long.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  // --- FILE UPLOAD HANDLERS ---
  const processUploadedFile = (file: File) => {
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    const maxSizeInBytes = 10 * 1024 * 1024; // 10MB limit

    if (!allowedTypes.includes(file.type)) {
      setErrors((prev) => ({ ...prev, file: "Invalid file type. Only PDF, PNG, and JPG allowed." }));
      return;
    }

    if (file.size > maxSizeInBytes) {
      setErrors((prev) => ({ ...prev, file: "File exceeds maximum size limit of 10MB." }));
      return;
    }

    setErrors((prev) => ({ ...prev, file: undefined }));
    setFormData((prev) => ({ ...prev, file }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setFormData((prev) => ({ ...prev, file: null }));
    setErrors((prev) => ({ ...prev, file: undefined }));
  };

  // --- SUBMIT BUTTON HANDLER ---
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    // Simulate API Payload Submission
    setTimeout(() => {
      console.log("Submitted Complaint Data:", formData);
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1500);
  };

  const handleReset = () => {
    setFormData({
      fullName: "",
      email: "",
      phone: "",
      complaintType: "",
      incidentDate: "",
      incidentTime: "",
      transactionId: "",
      description: "",
      file: null,
    });
    setErrors({});
    setIsSubmitted(false);
  };

  return (
    <div className="flex min-h-screen bg-[#040811] text-slate-200 font-sans">
      
      {/* ATLAS Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20">
                  ATLAS Incident Portal
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-white">Lodge New Complaint</h1>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                File an official cybercrime report or financial fraud incident for active investigation.
              </p>
            </div>
          </div>

          {/* Submission Success Banner */}
          {isSubmitted ? (
            <div className="bg-[#0d1322] border border-emerald-500/40 rounded-xl p-8 text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">Complaint Submitted Successfully</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Registered under Reference ID{" "}
                  <span className="text-blue-400 font-mono font-semibold">CMP-2026-98412</span>.
                </p>
              </div>
              <button
                onClick={handleReset}
                className="bg-[#0052cc] hover:bg-blue-600 text-white text-xs font-medium px-6 py-2.5 rounded-lg transition-all shadow-lg shadow-blue-600/20"
              >
                File Another Complaint
              </button>
            </div>
          ) : (
            /* Complaint Form */
            <form onSubmit={handleSubmit} className="bg-[#0d1322] border border-slate-800/80 rounded-xl p-6 sm:p-8 shadow-2xl space-y-6">
              
              {/* Personal Details */}
              <div className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-400" /> Personal Details
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        placeholder="Rohit Sharma"
                        className={`w-full bg-[#070b14] border ${errors.fullName ? "border-rose-500" : "border-slate-800"} rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                      />
                    </div>
                    {errors.fullName && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.fullName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="rohit.sharma@example.com"
                        className={`w-full bg-[#070b14] border ${errors.email ? "border-rose-500" : "border-slate-800"} rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                      />
                    </div>
                    {errors.email && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number *</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+91 98765 43210"
                        className={`w-full bg-[#070b14] border ${errors.phone ? "border-rose-500" : "border-slate-800"} rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                      />
                    </div>
                    {errors.phone && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.phone}</p>}
                  </div>
                </div>
              </div>

              {/* Incident Details & Transaction ID */}
              <div className="space-y-4 pt-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-blue-400" /> Incident Parameters
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Complaint Category *</label>
                    <select
                      name="complaintType"
                      value={formData.complaintType}
                      onChange={handleChange}
                      className={`w-full bg-[#070b14] border ${errors.complaintType ? "border-rose-500" : "border-slate-800"} rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                    >
                      <option value="">Select category...</option>
                      <option value="Financial Fraud">Financial / Banking Fraud</option>
                      <option value="Identity Theft">Identity Theft / Phishing</option>
                      <option value="Unauthorized Transaction">Unauthorized Transaction</option>
                      <option value="Cyber Stalking">Cyber Harassment</option>
                    </select>
                    {errors.complaintType && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.complaintType}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Incident Date *</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="date"
                        name="incidentDate"
                        value={formData.incidentDate}
                        onChange={handleChange}
                        className={`w-full bg-[#070b14] border ${errors.incidentDate ? "border-rose-500" : "border-slate-800"} rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                      />
                    </div>
                    {errors.incidentDate && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.incidentDate}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Incident Time (Approx.)</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="time"
                        name="incidentTime"
                        value={formData.incidentTime}
                        onChange={handleChange}
                        className="w-full bg-[#070b14] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Dedicated Transaction ID */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Transaction ID / Reference Number</label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      name="transactionId"
                      value={formData.transactionId}
                      onChange={handleChange}
                      placeholder="e.g. TXN-99887766 or UTR-2026-88910"
                      className="w-full bg-[#070b14] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Detailed Description *</label>
                  <textarea
                    name="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Provide explicit details including account numbers, links, or suspect communications..."
                    className={`w-full bg-[#070b14] border ${errors.description ? "border-rose-500" : "border-slate-800"} rounded-lg p-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                  ></textarea>
                  {errors.description && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.description}</p>}
                </div>
              </div>

              {/* Enhanced Interactive File Upload Area */}
              <div className="space-y-2 pt-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" /> Evidence Upload
                </h2>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                    isDragging
                      ? "border-blue-500 bg-blue-500/10 scale-[0.99]"
                      : errors.file
                      ? "border-rose-500/80 bg-rose-500/5"
                      : "border-slate-800 hover:border-slate-700 bg-[#070b14]"
                  }`}
                >
                  {formData.file ? (
                    <div className="flex items-center justify-between bg-[#0d1322] border border-slate-800 p-3 rounded-lg">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                        <div className="text-left truncate">
                          <p className="text-xs font-medium text-slate-200 truncate">{formData.file.name}</p>
                          <p className="text-[10px] text-slate-500">{(formData.file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center gap-1 py-2">
                      <Upload className={`w-6 h-6 mb-1 ${isDragging ? "text-blue-400 animate-bounce" : "text-slate-500"}`} />
                      <span className="text-xs font-medium text-slate-300">
                        {isDragging ? "Drop file here to attach" : "Drag & drop or click to upload evidence"}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Supported formats: PDF, PNG, JPG (Max 10MB)
                      </span>
                      <input
                        type="file"
                        onChange={handleFileChange}
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {errors.file && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.file}</p>}
              </div>

              {/* Form Action Controls */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Reset Form
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 bg-[#0052cc] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Submitting Report...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Incident Report</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </main>
    </div>
  );
}