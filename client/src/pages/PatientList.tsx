import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Calendar, MapPin, Phone, Plus, Search, User } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function PatientList() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: patients, isLoading } = trpc.patients.list.useQuery({ limit: 100, offset: 0 });
  const { data: searchResults } = trpc.patients.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  const displayedPatients = searchQuery.length >= 2 ? searchResults : patients;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Patients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {patients?.length ?? 0} total patients
          </p>
        </div>
        <Button onClick={() => setLocation("/patients/new")} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" />
          New Patient
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone number…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-xl h-11"
        />
      </div>

      {/* Patient List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : displayedPatients?.length === 0 ? (
        <div className="text-center py-16">
          <User className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            {searchQuery ? "No patients found" : "No patients yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? "Try a different search term" : "Add your first patient to get started"}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => setLocation("/patients/new")}
              className="mt-4 gap-2"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              Add Patient
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {displayedPatients?.map((patient) => (
            <Card
              key={patient.id}
              className="border shadow-sm card-hover cursor-pointer"
              onClick={() => setLocation(`/patients/${patient.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {patient.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{patient.name}</p>
                      {patient.importantNotes && (
                        <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                          ⚠ Notes
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {patient.phone}
                      </span>
                      {patient.age && (
                        <span className="text-xs text-muted-foreground">
                          {patient.age} yrs
                        </span>
                      )}
                      {patient.visitLocation && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {patient.visitLocation}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {new Date(patient.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
