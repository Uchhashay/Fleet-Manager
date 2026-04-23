import React, { useState, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfDay, 
  endOfDay, 
  eachDayOfInterval, 
  isSameDay, 
  isWithinInterval, 
  isSameMonth,
  getDay,
  setMonth,
  setYear,
  isValid,
  parse
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface CustomDateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (range: { start: Date; end: Date }) => void;
  initialRange: { start: Date; end: Date };
}

export function CustomDateRangePicker({ isOpen, onClose, onApply, initialRange }: CustomDateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | null>(initialRange.start);
  const [endDate, setEndDate] = useState<Date | null>(initialRange.end);
  const [leftMonth, setLeftMonth] = useState(startOfMonth(initialRange.start));
  const [rightMonth, setRightMonth] = useState(startOfMonth(addMonths(initialRange.start, 1)));

  const [startInput, setStartInput] = useState(format(initialRange.start, 'yyyy-MM-dd'));
  const [endInput, setEndInput] = useState(format(initialRange.end, 'yyyy-MM-dd'));

  const handleDateClick = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(date);
      setEndDate(null);
      setStartInput(format(date, 'yyyy-MM-dd'));
    } else {
      if (date < startDate) {
        setEndDate(startDate);
        setStartDate(date);
        setStartInput(format(date, 'yyyy-MM-dd'));
        setEndInput(format(startDate, 'yyyy-MM-dd'));
      } else {
        setEndDate(date);
        setEndInput(format(date, 'yyyy-MM-dd'));
      }
    }
  };

  const handleStartInputChange = (val: string) => {
    setStartInput(val);
    const d = parse(val, 'yyyy-MM-dd', new Date());
    if (isValid(d)) {
      setStartDate(d);
      setLeftMonth(startOfMonth(d));
      setRightMonth(startOfMonth(addMonths(d, 1)));
    }
  };

  const handleEndInputChange = (val: string) => {
    setEndInput(val);
    const d = parse(val, 'yyyy-MM-dd', new Date());
    if (isValid(d)) {
      setEndDate(d);
    }
  };

  const renderCalendar = (month: Date, setMonthFn: (d: Date) => void) => {
    const days = eachDayOfInterval({
      start: startOfMonth(month),
      end: endOfMonth(month)
    });

    const startDay = getDay(startOfMonth(month));
    const blanks = Array(startDay).fill(null);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-1">
            <select 
              value={month.getMonth()} 
              onChange={(e) => setMonthFn(setMonth(month, parseInt(e.target.value)))}
              className="bg-transparent text-sm font-bold text-primary focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i}>{format(new Date(2000, i, 1), 'MMMM')}</option>
              ))}
            </select>
            <select 
              value={month.getFullYear()} 
              onChange={(e) => setMonthFn(setYear(month, parseInt(e.target.value)))}
              className="bg-transparent text-sm font-bold text-primary focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 20 }).map((_, i) => {
                const year = new Date().getFullYear() - 10 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-secondary uppercase py-1">{d}</div>
          ))}
          {blanks.map((_, i) => <div key={`blank-${i}`} />)}
          {days.map(day => {
            const isSelected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
            const isInRange = startDate && endDate && isWithinInterval(day, { start: startDate, end: endDate });
            
            return (
              <button
                key={day.toString()}
                onClick={() => handleDateClick(day)}
                className={cn(
                  "h-8 w-8 rounded-lg text-xs font-medium transition-all flex items-center justify-center relative",
                  isSelected ? "bg-accent text-white z-10" : 
                  isInRange ? "bg-accent/10 text-accent rounded-none first:rounded-l-lg last:rounded-r-lg" : 
                  "hover:bg-accent/5 text-primary"
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Select Date Range</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Custom Period</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Start Date</label>
              <input 
                type="text" 
                placeholder="YYYY-MM-DD"
                value={startInput}
                onChange={(e) => handleStartInputChange(e.target.value)}
                className="input w-full"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">End Date</label>
              <input 
                type="text" 
                placeholder="YYYY-MM-DD"
                value={endInput}
                onChange={(e) => handleEndInputChange(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setLeftMonth(subMonths(leftMonth, 1))} className="p-1 hover:bg-border/50 rounded-lg"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-sm font-bold text-primary">{format(leftMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setLeftMonth(addMonths(leftMonth, 1))} className="p-1 hover:bg-border/50 rounded-lg"><ChevronRight className="h-4 w-4" /></button>
              </div>
              {renderCalendar(leftMonth, setLeftMonth)}
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setRightMonth(subMonths(rightMonth, 1))} className="p-1 hover:bg-border/50 rounded-lg"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-sm font-bold text-primary">{format(rightMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setRightMonth(addMonths(rightMonth, 1))} className="p-1 hover:bg-border/50 rounded-lg"><ChevronRight className="h-4 w-4" /></button>
              </div>
              {renderCalendar(rightMonth, setRightMonth)}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-accent/5 flex items-center justify-between">
          <div className="text-sm font-bold text-primary">
            {startDate && endDate ? (
              `${format(startDate, 'yyyy-MM-dd')} - ${format(endDate, 'yyyy-MM-dd')}`
            ) : (
              'Select a range'
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button 
              disabled={!startDate || !endDate}
              onClick={() => {
                if (startDate && endDate) {
                  onApply({ start: startOfDay(startDate), end: endOfDay(endDate) });
                  onClose();
                }
              }} 
              className="btn-primary"
            >
              Apply Range
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
