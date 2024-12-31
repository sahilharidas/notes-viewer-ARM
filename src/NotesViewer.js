"use client";
import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Filter, X } from 'lucide-react';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const NotesViewer = () => {
  const [notes, setNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  // Replace this URL with your published Google Sheet CSV URL
  const SHEETS_URL = 'YOUR_GOOGLE_SHEETS_URL';

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const response = await fetch(SHEETS_URL);
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          complete: (results) => {
            const validNotes = results.data
              .filter(note => note.title && note.content)
              .map((note, index) => ({
                id: index + 1,
                title: note.title,
                content: note.content,
                tag: note.tag || 'Untagged',
                imageUrl: note.imageUrl || null
              }));
            setNotes(validNotes);
            setFilteredNotes(validNotes);
            setLoading(false);
          },
          error: (error) => {
            setError('Failed to parse notes');
            setLoading(false);
          }
        });
      } catch (err) {
        setError('Failed to fetch notes');
        setLoading(false);
      }
    };
    fetchNotes();
  }, []);

  useEffect(() => {
    if (activeFilters.length === 0) {
      setFilteredNotes(notes);
    } else {
      const filtered = notes.filter(note => activeFilters.includes(note.tag));
      setFilteredNotes(filtered);
      setCurrentIndex(0);
    }
  }, [activeFilters, notes]);

  const uniqueTags = [...new Set(notes.map(note => note.tag))];

  const toggleFilter = (tag) => {
    setActiveFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setActiveFilters([]);
  };

  const goToNext = () => {
    if (currentIndex < filteredNotes.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowUp') {
        goToPrevious();
      } else if (e.key === 'ArrowDown') {
        goToNext();
      }
    };
    window.addEventListener('keydown', handleKeyPress);

    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading your notes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  if (filteredNotes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">
          {notes.length === 0 ? "No notes found. Add some to your Google Sheet!" : "No notes match your selected filters."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
      {/* Filter UI */}
      <div className="w-full max-w-md mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:bg-gray-50"
        >
          <Filter size={20} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
        {showFilters && (
          <div className="mt-2 p-4 bg-white rounded-lg shadow-sm">
            <div className="flex flex-wrap gap-2">
              {uniqueTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleFilter(tag)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    activeFilters.includes(tag) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {activeFilters.length > 0 && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-700 flex items-center gap-1"
                >
                  <X size={14} /> Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md h-full flex flex-col items-center justify-center gap-4">
        {/* Navigation indicator */}
        <div className="text-sm text-gray-500">
          {currentIndex + 1} / {filteredNotes.length}
        </div>

        {/* Main content card */}
        <div className="w-full aspect-[9/16] bg-white shadow-lg relative overflow-hidden rounded-lg">
          <div className="h-full flex flex-col items-center p-6 overflow-y-auto">
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full mb-4">
              {filteredNotes[currentIndex].tag}
            </span>
            <h2 className="text-2xl font-bold mb-4">
              {filteredNotes[currentIndex].title}
            </h2>
            {/* Image (if present) */}
            {filteredNotes[currentIndex].imageUrl && (
              <img
                src={filteredNotes[currentIndex].imageUrl}
                alt={filteredNotes[currentIndex].title}
                className="w-full h-48 object-cover rounded-lg mb-4"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
            {/* Markdown content */}
            <div className="prose prose-sm w-full">
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="text-left">
                {filteredNotes[currentIndex].content}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Navigation controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className={`p-2 rounded-full ${
              currentIndex === 0 ? 'text-gray-300' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ChevronUp size={24} />
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex === filteredNotes.length - 1}
            className={`p-2 rounded-full ${
              currentIndex === filteredNotes.length - 1 ? 'text-gray-300' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ChevronDown size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotesViewer;
